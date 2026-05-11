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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = formidable({
    maxFileSize: 20 * 1024 * 1024, // 20MB
    filter: ({ mimetype }) => mimetype === 'application/pdf',
  });

  try {
    const [_fields, files] = await form.parse(req);
    const file = Array.isArray(files.file) ? files.file[0] : files.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const buffer = fs.readFileSync(file.filepath);
    const mimeType = file.mimetype || 'application/pdf';
    const originalFilename = file.originalFilename || 'document.pdf';

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
