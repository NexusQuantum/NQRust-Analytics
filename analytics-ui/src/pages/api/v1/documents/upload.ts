import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import { promises as fsp } from 'fs';
import { components, serverConfig } from '@/common';
import {
  DEFAULT_DOCUMENT_MAX_SIZE_MB,
  isAllowedDocument,
} from '@/utils/documentFormats';

export const config = {
  api: {
    bodyParser: false,
  },
};

const { documentService } = components;

// Source of truth lives in @/utils/documentFormats. Reuse so the upload
// endpoint, documentService, and the UI client can't drift from each other.

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const maxSizeMb =
    serverConfig.documentMaxSizeMb || DEFAULT_DOCUMENT_MAX_SIZE_MB;

  const form = formidable({
    maxFileSize: maxSizeMb * 1024 * 1024,
    filter: ({ mimetype, originalFilename }) =>
      isAllowedDocument(mimetype, originalFilename),
  });

  let filepath: string | null = null;
  try {
    const [fields, files] = await form.parse(req);
    const file = Array.isArray(files.file) ? files.file[0] : files.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    filepath = file.filepath;

    // Optional folder placement. Empty / missing = upload to root.
    // Anything non-numeric is rejected — we don't want a typo'd value to
    // silently create an orphaned document.
    const rawFolderId = Array.isArray(fields.folderId)
      ? fields.folderId[0]
      : fields.folderId;
    let folderId: number | null = null;
    if (rawFolderId != null && rawFolderId !== '') {
      const parsed = Number.parseInt(String(rawFolderId), 10);
      if (!Number.isInteger(parsed)) {
        return res.status(400).json({ error: 'Invalid folderId' });
      }
      folderId = parsed;
    }

    // Async read — at 100 MB a sync readFileSync would block Node's
    // event loop long enough to stall other requests.
    const buffer = await fsp.readFile(file.filepath);
    const originalFilename = file.originalFilename || 'document';
    // Trust the extension when no mime is provided (some browsers send
    // octet-stream for .md/.docx/.pptx).
    const mimeType = file.mimetype || 'application/octet-stream';

    const doc = await documentService.uploadDocument(
      buffer,
      originalFilename,
      mimeType,
      folderId,
    );

    return res.status(201).json({
      id: doc.id,
      filename: doc.originalFilename,
      status: doc.status,
      size: doc.size,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Upload failed' });
  } finally {
    // Always clean up the temp file, even when uploadDocument threw.
    if (filepath) {
      await fsp.unlink(filepath).catch(() => {
        // Best-effort cleanup; formidable will re-use the temp dir.
      });
    }
  }
}
