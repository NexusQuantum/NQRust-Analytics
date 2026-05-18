import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import { components } from '@/common';

export const config = {
  api: {
    bodyParser: false,
  },
};

const { documentService } = components;

// Keep this list in sync with documentService.ts and UploadDialog.tsx.
// We accept by mime OR extension because browsers are unreliable about
// the mime they send for .md / .docx / .pptx.
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'text/markdown',
  'text/x-markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);
const ALLOWED_EXTS = new Set(['.pdf', '.md', '.markdown', '.docx', '.pptx']);

function isAllowed(mimetype: string | null, originalFilename: string | null): boolean {
  if (mimetype && ALLOWED_MIME_TYPES.has(mimetype)) return true;
  if (originalFilename) {
    const lower = originalFilename.toLowerCase();
    const ext = lower.slice(lower.lastIndexOf('.'));
    if (ALLOWED_EXTS.has(ext)) return true;
  }
  return false;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = formidable({
    maxFileSize: 50 * 1024 * 1024, // 50MB — keep in sync with documentService and UploadDialog
    filter: ({ mimetype, originalFilename }) => isAllowed(mimetype, originalFilename),
  });

  try {
    const [_fields, files] = await form.parse(req);
    const file = Array.isArray(files.file) ? files.file[0] : files.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const buffer = fs.readFileSync(file.filepath);
    const originalFilename = file.originalFilename || 'document';
    // Trust the extension when no mime is provided (some browsers send
    // octet-stream for .md/.docx/.pptx).
    const mimeType = file.mimetype || 'application/octet-stream';

    const doc = await documentService.uploadDocument(buffer, originalFilename, mimeType);

    // Clean up temp file
    fs.unlinkSync(file.filepath);

    return res.status(201).json({
      id: doc.id,
      filename: doc.originalFilename,
      status: doc.status,
      size: doc.size,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Upload failed' });
  }
}
