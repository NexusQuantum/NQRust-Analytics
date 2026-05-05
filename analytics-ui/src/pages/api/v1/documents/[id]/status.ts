/**
 * Poll the indexing status for a document.
 *
 * Returns the local DB record. Optionally, when the AI service is wired,
 * we also reconcile against the live status from the AI service so the
 * `ready/failed` transition propagates to the DB even if the indexing
 * background task didn't get a chance to call back.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { components } from '@/common';
import { getLogger } from '@server/utils';

const logger = getLogger('DocumentStatus');
logger.level = 'debug';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { id } = req.query;
  const docId = Number(Array.isArray(id) ? id[0] : id);
  if (!docId || Number.isNaN(docId)) {
    return res.status(400).json({ error: 'invalid id' });
  }

  const { documentService, analyticsAIAdaptor } = components;
  const doc = await documentService.getById(docId);
  if (!doc) return res.status(404).json({ error: 'Not found' });

  // Reconcile with AI service when available and DB still says in-progress.
  const inProgress = ['uploading', 'parsing', 'embedding'].includes(doc.status);
  const adaptor = analyticsAIAdaptor as unknown as {
    getDocumentIndexStatus?: (id: string) => Promise<{
      status: string;
      chunks_indexed?: number;
      error?: { code: string; message: string };
    }>;
  };
  if (inProgress && typeof adaptor.getDocumentIndexStatus === 'function') {
    try {
      const live = await adaptor.getDocumentIndexStatus(String(doc.id));
      if (live.status === 'ready' && doc.status !== 'ready') {
        await documentService.updateStatus(doc.id, 'ready', {
          qdrantIndexedAt: new Date(),
        });
        doc.status = 'ready';
      } else if (live.status === 'failed' && doc.status !== 'failed') {
        await documentService.updateStatus(doc.id, 'failed', {
          errorMessage: live.error?.message || 'Indexing failed',
        });
        doc.status = 'failed';
      } else if (live.status === 'embedding' && doc.status === 'parsing') {
        await documentService.updateStatus(doc.id, 'embedding');
        doc.status = 'embedding';
      }
    } catch (e: any) {
      logger.warn(`AI service status fetch failed: ${e?.message || e}`);
    }
  }

  return res.status(200).json({
    id: doc.id,
    notebookId: doc.notebookId,
    filename: doc.filename,
    status: doc.status,
    pageCount: doc.pageCount,
    errorMessage: doc.errorMessage,
    qdrantIndexedAt: doc.qdrantIndexedAt,
  });
}
