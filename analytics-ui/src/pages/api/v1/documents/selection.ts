import { NextApiRequest, NextApiResponse } from 'next';
import { components } from '@/common';

const { documentService } = components;

/**
 * GET  /api/v1/documents/selection — get selected document IDs
 * PUT  /api/v1/documents/selection — set selected document IDs (replaces entire selection)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'GET') {
    try {
      const ids = await documentService.getSelectedDocumentIds();
      return res.status(200).json({ documentIds: ids });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'PUT') {
    const { documentIds } = req.body as { documentIds: string[] };
    if (!Array.isArray(documentIds)) {
      return res.status(400).json({ error: 'documentIds must be an array' });
    }
    try {
      await documentService.setDocumentSelection(documentIds);
      return res.status(200).json({ documentIds });
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
