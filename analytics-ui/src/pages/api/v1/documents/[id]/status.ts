import { NextApiRequest, NextApiResponse } from 'next';
import { components } from '@/common';
import { requireLicense } from '@/apollo/server/utils/licenseGuard';

const { documentService } = components;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!requireLicense(res)) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query as { id: string };

  try {
    const doc = await documentService.getDocument(id);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    return res.status(200).json({
      id: doc.id,
      status: doc.status,
      pageCount: doc.pageCount,
      errorMessage: doc.errorMessage,
      indexedAt: doc.indexedAt,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
