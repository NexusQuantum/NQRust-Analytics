import { NextApiRequest, NextApiResponse } from 'next';
import { createReadStream, statSync } from 'fs';
import path from 'path';
import { getToken } from 'next-auth/jwt';
import { components } from '@/common';
import { getConfig } from '@server/config';

const { documentService } = components;

/**
 * GET /api/v1/documents/[id]/file — stream the raw uploaded file bytes.
 *
 * Used by the UI Document Library page to render a PDF thumbnail
 * client-side via pdf.js. Supports HTTP Range so pdf.js can fetch only
 * the first page chunk without pulling the whole PDF into memory.
 *
 * Auth: requires a valid NextAuth session. Sibling endpoints under
 * `/api/v1/documents/*` don't enforce this yet, but this one streams
 * raw user-uploaded bytes — a much higher blast radius if UUIDs leak —
 * so we gate it. (Tightening the siblings is a follow-up.)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id } = req.query;
  if (typeof id !== 'string' || !id) {
    return res.status(400).json({ error: 'Invalid document id' });
  }

  const doc = await documentService.getDocument(id);
  if (!doc) {
    return res.status(404).json({ error: 'Document not found' });
  }

  // Defence-in-depth: `doc.storagePath` is set by our own upload code today,
  // but containing it under the configured storage root means a future
  // DB-write vulnerability can't be escalated into arbitrary file reads.
  const storageRoot = path.resolve(
    getConfig().documentStorageDir || `${process.cwd()}/storage/documents`,
  );
  const resolvedPath = path.resolve(doc.storagePath);
  if (
    resolvedPath !== storageRoot &&
    !resolvedPath.startsWith(storageRoot + path.sep)
  ) {
    return res.status(403).json({ error: 'Storage path outside root' });
  }

  let stat;
  try {
    stat = statSync(resolvedPath);
  } catch {
    return res.status(404).json({ error: 'File missing from storage' });
  }

  res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
  res.setHeader('Accept-Ranges', 'bytes');
  // Public-cache for a short window. Same file = same bytes (content-addressable
  // storage), so it's safe to let the browser cache for a few minutes.
  res.setHeader('Cache-Control', 'private, max-age=300');

  // Range request — pdf.js uses this to fetch just the first page chunk.
  // We only handle the single-range form (`bytes=START-` or `bytes=START-END`);
  // suffix-range (`bytes=-500`) and multi-range aren't needed by pdf.js.
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d+)-(\d+)?$/.exec(range);
    if (match) {
      const start = Number.parseInt(match[1], 10);
      const end = match[2] ? Number.parseInt(match[2], 10) : stat.size - 1;
      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        end < start ||
        start >= stat.size ||
        end >= stat.size
      ) {
        res.setHeader('Content-Range', `bytes */${stat.size}`);
        return res.status(416).end();
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', `${end - start + 1}`);
      createReadStream(resolvedPath, { start, end }).pipe(res);
      return;
    }
  }

  res.setHeader('Content-Length', `${stat.size}`);
  createReadStream(resolvedPath).pipe(res);
}
