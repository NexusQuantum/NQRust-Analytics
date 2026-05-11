import { NextApiRequest, NextApiResponse } from 'next';
import { components } from '@/common';

const { documentService } = components;

/**
 * GET  /api/v1/documents/[id] — get single document
 * DELETE /api/v1/documents/[id] — delete document
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { id } = req.query as { id: string };

  if (req.method === 'GET') {
    try {
      const doc = await documentService.getDocument(id);
      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }
      return res.status(200).json(doc);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await documentService.deleteDocument(id);
      return res.status(200).json({ status: 'ok' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
