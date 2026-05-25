import { NextApiRequest, NextApiResponse } from 'next';
import { components } from '@/common';

const { documentService } = components;

/**
 * GET /api/v1/documents
 *
 * Query params:
 *   - folderId=<number> — only docs in that folder
 *   - folderId=root     — only docs at the root (no folder)
 *   - (omitted)         — all documents (used by chat-context picker
 *                         that needs cross-folder visibility)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const raw = req.query.folderId;
    let folderFilter: number | null | undefined;
    if (raw === undefined) {
      folderFilter = undefined; // no filter
    } else if (raw === 'root') {
      folderFilter = null; // root-level only
    } else {
      const parsed = Number.parseInt(String(raw), 10);
      if (!Number.isInteger(parsed)) {
        return res.status(400).json({ error: 'Invalid folderId' });
      }
      folderFilter = parsed;
    }

    const docs = await documentService.getDocumentsByFolder(folderFilter);
    return res.status(200).json({ documents: docs });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
