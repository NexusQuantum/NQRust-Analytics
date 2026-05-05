/**
 * Doc-only Q&A proxy. Forwards to the AI service /v1/documents/ask
 * endpoint and returns the synchronous answer.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { getToken } from 'next-auth/jwt';
import { getLogger } from '@server/utils';

const logger = getLogger('DocumentAsk');
logger.level = 'debug';

interface AskBody {
  query: string;
  selectedDocumentIds: number[];
  projectId?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Auth — same pattern as graphql.ts
  try {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token?.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
  } catch (e) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const body = req.body as AskBody;
  if (!body?.query || !Array.isArray(body?.selectedDocumentIds) || body.selectedDocumentIds.length === 0) {
    return res
      .status(400)
      .json({ error: 'query and non-empty selectedDocumentIds are required' });
  }

  const aiEndpoint =
    process.env.ANALYTICS_AI_ENDPOINT || 'http://localhost:5555';

  try {
    const aiRes = await fetch(`${aiEndpoint}/v1/documents/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: body.query,
        selected_document_ids: body.selectedDocumentIds.map(String),
        project_id: body.projectId || '',
      }),
    });
    const data = await aiRes.json().catch(() => ({}));
    if (!aiRes.ok) {
      logger.warn(`AI service ask failed: ${aiRes.status} ${JSON.stringify(data)}`);
      return res.status(aiRes.status).json(data);
    }
    return res.status(200).json(data);
  } catch (e: any) {
    logger.error(`Proxy to AI service failed: ${e?.message || e}`);
    return res.status(502).json({ error: 'AI service unreachable' });
  }
}
