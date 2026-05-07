/**
 * Document upload endpoint (multipart/form-data).
 *
 * Form fields:
 *   - file:        the binary file (required, single)
 *   - notebookId:  destination notebook (required)
 *
 * On success: persists the file to local storage, creates a `document` row
 * with status='parsing', kicks off async indexing in the AI service, and
 * returns the new document record.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import formidable from 'formidable';
import { getToken } from 'next-auth/jwt';

import { components } from '@/common';
import { getDocumentStorage } from '@server/utils/documentStorage';
import { DOCUMENT_LIMITS } from '@server/services/documentService';
import { getLogger } from '@server/utils';

const logger = getLogger('DocumentUpload');

// Disable Next.js body parsing so formidable can read the raw stream.
export const config = {
  api: { bodyParser: false },
};

const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.docx',
  '.pptx',
  '.xlsx',
  '.md',
  '.markdown',
  '.txt',
  '.html',
  '.htm',
]);

function sanitizeFilename(name: string): string {
  // Strip path separators and control chars; keep printable ascii + spaces.
  return name
    .replace(/[\\/]/g, '_')
    .replace(/[^\w\-. ]/g, '_')
    .slice(0, 255);
}

function sha256OfFile(absolutePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(absolutePath);
    s.on('data', (chunk) => h.update(chunk));
    s.on('end', () => resolve(h.digest('hex')));
    s.on('error', reject);
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Auth (same pattern as graphql.ts)
  let userId: number | null = null;
  try {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (token?.userId) userId = Number(token.userId);
  } catch (e) {
    logger.warn(`Auth extraction failed: ${e}`);
  }
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const form = formidable({
    multiples: false,
    maxFileSize: DOCUMENT_LIMITS.MAX_FILE_BYTES,
    keepExtensions: true,
  });

  let fields: formidable.Fields;
  let files: formidable.Files;
  try {
    [fields, files] = await form.parse(req);
  } catch (e: any) {
    if (e?.code === 'LIMIT_FILE_SIZE' || /maxFileSize/i.test(String(e))) {
      return res.status(413).json({
        error: `File exceeds ${DOCUMENT_LIMITS.MAX_FILE_BYTES} byte limit`,
      });
    }
    logger.error(`Multipart parse failed: ${e}`);
    return res.status(400).json({ error: 'Invalid multipart payload' });
  }

  const notebookIdRaw = Array.isArray(fields.notebookId)
    ? fields.notebookId[0]
    : fields.notebookId;
  const notebookId = Number(notebookIdRaw);
  if (!notebookId || Number.isNaN(notebookId)) {
    return res.status(400).json({ error: 'notebookId is required' });
  }

  const fileEntry = Array.isArray(files.file) ? files.file[0] : files.file;
  if (!fileEntry) {
    logger.warn(
      `Upload missing file. fields=${JSON.stringify(Object.keys(fields))} files=${JSON.stringify(Object.keys(files))}`,
    );
    return res.status(400).json({ error: 'file is required' });
  }

  const originalFilename = fileEntry.originalFilename || 'unnamed';
  const ext = path.extname(originalFilename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return res
      .status(415)
      .json({ error: `Unsupported file type: ${ext || '(no extension)'}` });
  }

  const { documentService, notebookService, analyticsAIAdaptor } = components;

  const notebook = await notebookService.getById(notebookId);
  if (!notebook) {
    return res.status(404).json({ error: 'Notebook not found' });
  }

  const tempPath = fileEntry.filepath;
  const size = fileEntry.size;
  const mimeType = fileEntry.mimetype || 'application/octet-stream';

  // Compute hash before moving — we may dedupe.
  let hash: string;
  try {
    hash = await sha256OfFile(tempPath);
  } catch (e) {
    logger.error(`Hash failed: ${e}`);
    return res.status(500).json({ error: 'Failed to read uploaded file' });
  }

  // Move to permanent storage. We use the hash as the disk-name hint so
  // identical uploads coalesce; the DB row still has its own id.
  const storage = getDocumentStorage();
  let storagePath: string;
  try {
    storagePath = await storage.save({
      projectId: notebook.projectId,
      documentIdHint: hash.slice(0, 16),
      extension: ext,
      sourcePath: tempPath,
    });
  } catch (e: any) {
    logger.error(`Storage save failed: ${e}`);
    return res.status(500).json({ error: 'Failed to persist file' });
  }

  // Create DB row (this also enforces the per-notebook count limit).
  let doc;
  try {
    doc = await documentService.create(
      {
        notebookId,
        filename: sanitizeFilename(originalFilename),
        originalFilename,
        storagePath,
        mimeType,
        size,
        hash,
      },
      userId,
    );
  } catch (e: any) {
    // Rollback storage write so we don't leave orphaned files
    await storage.remove(storagePath).catch(() => undefined);
    return res.status(400).json({ error: e.message || String(e) });
  }

  // Kick off indexing on the AI service. Direct fetch keeps this independent
  // of the long-lived adapter instance so dev HMR can't leave a stale binding.
  const aiEndpoint =
    process.env.ANALYTICS_AI_ENDPOINT || 'http://localhost:5555';
  const indexPayload = {
    document_id: String(doc.id),
    notebook_id: String(notebookId),
    project_id: String(notebook.projectId),
    filename: doc.filename,
    file_path: storage.absolutePath(storagePath),
  };
  try {
    logger.debug(
      `Triggering AI service index: ${aiEndpoint}/v1/documents/index payload=${JSON.stringify(
        indexPayload,
      )}`,
    );
    const aiRes = await fetch(`${aiEndpoint}/v1/documents/index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(indexPayload),
    });
    if (!aiRes.ok) {
      const errBody = await aiRes.text().catch(() => '');
      throw new Error(`AI service ${aiRes.status}: ${errBody}`);
    }
    await documentService.updateStatus(doc.id, 'parsing');
    logger.info(`Document ${doc.id} indexing started in AI service`);
  } catch (e: any) {
    logger.warn(`Index trigger failed for document ${doc.id}: ${e?.message || e}`);
    await documentService.updateStatus(doc.id, 'failed', {
      errorMessage: `Failed to start indexing: ${e?.message || e}`,
    });
  }

  return res.status(201).json({
    id: doc.id,
    notebookId: doc.notebookId,
    filename: doc.filename,
    status: doc.status,
    size: doc.size,
    mimeType: doc.mimeType,
    createdAt: doc.createdAt,
  });
}
