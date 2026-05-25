import { NextApiRequest, NextApiResponse } from 'next';
import { components } from '@/common';

const { documentFolderService } = components;

/**
 * PATCH /api/v1/documents/[id]/folder
 * body: { folderId: number | null }
 *
 * Move a document to a folder. `null` moves it back to the root.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const documentId = req.query.id;
  if (typeof documentId !== 'string' || !documentId) {
    return res.status(400).json({ error: 'Invalid document id' });
  }

  try {
    const { folderId } = req.body || {};
    let normalized: number | null = null;
    if (folderId != null && folderId !== '') {
      const parsed = Number.parseInt(String(folderId), 10);
      if (!Number.isInteger(parsed)) {
        return res.status(400).json({ error: 'Invalid folderId' });
      }
      normalized = parsed;
    }
    const doc = await documentFolderService.moveDocument(
      documentId,
      normalized,
    );
    return res.status(200).json(doc);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}
