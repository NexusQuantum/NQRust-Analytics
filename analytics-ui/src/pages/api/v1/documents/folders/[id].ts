import { NextApiRequest, NextApiResponse } from 'next';
import { components } from '@/common';
import type { DeleteFolderStrategy } from '@server/services/documentFolderService';

const { documentFolderService } = components;

/**
 * GET    /api/v1/documents/folders/[id]                     — folder + breadcrumb
 * PATCH  /api/v1/documents/folders/[id]                     — body: { name?, parentFolderId? }
 * DELETE /api/v1/documents/folders/[id]?strategy=<strategy> — strategy:
 *   - move-to-parent (default): children & docs moved to deleted folder's parent
 *   - delete-all              : whole subtree gone; docs unlinked to root
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const rawId = req.query.id;
  const id = Number.parseInt(String(rawId), 10);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Invalid folder id' });
  }

  if (req.method === 'GET') {
    try {
      const breadcrumb = await documentFolderService.getBreadcrumb(id);
      if (breadcrumb.length === 0) {
        return res.status(404).json({ error: 'Folder not found' });
      }
      // `?stats=1` opts into the subtree count. Cheaper than a separate
      // endpoint and keeps the breadcrumb call site untouched when stats
      // aren't needed (most page loads).
      const wantStats = req.query.stats === '1' || req.query.stats === 'true';
      const stats = wantStats
        ? await documentFolderService.getSubtreeStats(id)
        : undefined;
      return res.status(200).json({
        folder: breadcrumb[breadcrumb.length - 1],
        breadcrumb,
        ...(stats ? { stats } : {}),
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'PATCH') {
    const { name, parentFolderId } = req.body || {};
    const hasName = typeof name === 'string';
    const hasMove = parentFolderId !== undefined;

    if (!hasName && !hasMove) {
      return res
        .status(400)
        .json({ error: 'Provide name or parentFolderId' });
    }
    // Rename and move are independent service calls and can't share a
    // transaction without restructuring the service. Reject combined
    // updates so the client never observes a partial success — the UI
    // already sends them separately (rename modal vs. move modal).
    if (hasName && hasMove) {
      return res.status(400).json({
        error: 'Send name and parentFolderId in separate requests',
      });
    }

    try {
      if (hasName) {
        const updated = await documentFolderService.renameFolder(id, name);
        return res.status(200).json(updated);
      }
      let normalizedParent: number | null = null;
      if (parentFolderId !== null && parentFolderId !== '') {
        const parsed = Number.parseInt(String(parentFolderId), 10);
        if (!Number.isInteger(parsed)) {
          return res.status(400).json({ error: 'Invalid parentFolderId' });
        }
        normalizedParent = parsed;
      }
      const updated = await documentFolderService.moveFolder(
        id,
        normalizedParent,
      );
      return res.status(200).json(updated);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const strategy = (req.query.strategy as DeleteFolderStrategy) ||
        'move-to-parent';
      if (
        strategy !== 'move-to-parent' &&
        strategy !== 'delete-all'
      ) {
        return res.status(400).json({ error: 'Invalid strategy' });
      }
      await documentFolderService.deleteFolder(id, strategy);
      return res.status(200).json({ status: 'ok' });
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
