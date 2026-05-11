import { NextApiRequest, NextApiResponse } from 'next';
import { components } from '@/common';

const { documentService } = components;

/**
 * GET /api/v1/documents — list all documents
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const docs = await documentService.getAllDocuments();
    return res.status(200).json({ documents: docs });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
