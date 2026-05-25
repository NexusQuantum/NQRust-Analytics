import { NextApiRequest, NextApiResponse } from 'next';
import { components } from '@/common';

const { documentFolderService } = components;

/**
 * GET  /api/v1/documents/folders                — list ALL folders (used
 *                                                  by the "Move to..."
 *                                                  picker which needs the
 *                                                  full tree).
 * GET  /api/v1/documents/folders?parentId=N     — direct children of N.
 * GET  /api/v1/documents/folders?parentId=root  — root-level folders.
 *
 * POST /api/v1/documents/folders                — body: { name, parentFolderId }
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'GET') {
    try {
      const raw = req.query.parentId;
      if (raw === undefined) {
        const folders = await documentFolderService.listAll();
        return res.status(200).json({ folders });
      }
      let parentId: number | null;
      if (raw === 'root') {
        parentId = null;
      } else {
        const parsed = Number.parseInt(String(raw), 10);
        if (!Number.isInteger(parsed)) {
          return res.status(400).json({ error: 'Invalid parentId' });
        }
        parentId = parsed;
      }
      const folders = await documentFolderService.listChildren(parentId);
      return res.status(200).json({ folders });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const { name, parentFolderId } = req.body || {};
      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'name is required' });
      }
      let normalizedParent: number | null = null;
      if (parentFolderId != null && parentFolderId !== '') {
        const parsed = Number.parseInt(String(parentFolderId), 10);
        if (!Number.isInteger(parsed)) {
          return res.status(400).json({ error: 'Invalid parentFolderId' });
        }
        normalizedParent = parsed;
      }
      const folder = await documentFolderService.createFolder({
        name,
        parentFolderId: normalizedParent,
      });
      return res.status(201).json(folder);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
