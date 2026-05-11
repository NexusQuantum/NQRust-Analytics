import { NextApiRequest, NextApiResponse } from 'next';
import { components } from '@/common';
import { getLogger } from '@server/utils';

const logger = getLogger('DocumentTreeCallback');
const { documentService } = components;

/**
 * POST /api/v1/documents/[id]/tree
 *
 * Callback endpoint called by analytics-ai-service when PageIndex indexing is done.
 * Body: { tree_json: string, page_count: number, model_used?: string, build_time_ms?: number, error?: string }
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query as { id: string };
  const { tree_json, page_count, model_used, build_time_ms, error } = req.body;

  try {
    if (error) {
      logger.error(`Document ${id} indexing failed: ${error}`);
      await documentService.onIndexingFailed(id, error);
      return res.status(200).json({ status: 'failed' });
    }

    if (!tree_json) {
      return res.status(400).json({ error: 'tree_json is required' });
    }

    logger.info(`Document ${id} indexing complete, ${page_count} pages`);
    await documentService.onIndexingComplete(
      id,
      tree_json,
      page_count || 0,
      model_used,
      build_time_ms,
    );

    return res.status(200).json({ status: 'ok' });
  } catch (err: any) {
    logger.error(`Tree callback error for ${id}: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
}
