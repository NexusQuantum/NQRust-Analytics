import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { LoadingOutlined, FilePdfOutlined } from '@ant-design/icons';

interface Props {
  documentId: string;
  /** Logical width in CSS pixels. Height auto-scales to PDF aspect ratio. */
  width?: number;
}

const Container = styled.div<{ $width: number }>`
  position: relative;
  width: ${(p) => p.$width}px;
  height: ${(p) => Math.round(p.$width * (11 / 8.5))}px;
  background: var(--gray-1);
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
`;

const Img = styled.img`
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
`;

const Spinner = styled(LoadingOutlined)`
  font-size: 24px;
  color: var(--gray-5);
`;

const Fallback = styled(FilePdfOutlined)`
  font-size: 48px;
  color: var(--red-4);
`;

// Render cache keyed by documentId. Entries persist for the page lifetime so
// scrolling / re-renders don't trigger redundant pdf.js loads. We could
// upgrade to IndexedDB later for cross-session persistence, but in-memory is
// enough for the common "land on page, view docs" case.
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

// pdf.js gets imported lazily on first use so it never lands in the initial
// bundle. Single shared promise so concurrent first-renders share one load.
let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

// Worker is copied to public/ via the `postinstall` script in package.json,
// so it's served at this stable path. Avoids fragile `?url` imports that
// require webpack/Next.js-specific loader config.
const WORKER_SRC = '/pdf.worker.min.mjs';

async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = WORKER_SRC;
      return mod;
    });
  }
  return pdfjsPromise;
}

async function renderThumbnail(
  documentId: string,
  width: number,
): Promise<string> {
  const cached = cache.get(documentId);
  if (cached) return cached;
  const existing = inflight.get(documentId);
  if (existing) return existing;

  const promise = (async () => {
    const pdfjs = await getPdfjs();
    const loadingTask = pdfjs.getDocument({
      url: `/api/v1/documents/${encodeURIComponent(documentId)}/file`,
      // Don't disable range — Next.js endpoint supports it and we'd
      // rather only pull the first chunk for big PDFs.
      disableAutoFetch: true,
      disableStream: false,
    });
    const pdf = await loadingTask.promise;
    try {
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      // Scale so the rendered canvas width matches our target CSS width,
      // accounting for devicePixelRatio so it looks crisp on retina.
      const dpr = window.devicePixelRatio || 1;
      const scale = (width * dpr) / viewport.width;
      const scaled = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(scaled.width);
      canvas.height = Math.ceil(scaled.height);
      // pdf.js 5.x derives the 2D context from `canvas` itself — pass it
      // directly instead of the legacy `canvasContext` arg.
      await page.render({ canvas, viewport: scaled }).promise;
      const dataUrl = canvas.toDataURL('image/png');
      cache.set(documentId, dataUrl);
      return dataUrl;
    } finally {
      await pdf.destroy();
    }
  })();

  inflight.set(documentId, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(documentId);
  }
}

export default function PdfThumbnail({ documentId, width = 180 }: Props) {
  const [src, setSrc] = useState<string | null>(
    cache.get(documentId) ?? null,
  );
  const [failed, setFailed] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    if (src) return;
    setFailed(false);
    renderThumbnail(documentId, width)
      .then((url) => {
        if (!cancelled.current) setSrc(url);
      })
      .catch((err) => {
        if (cancelled.current) return;
        console.warn(`PdfThumbnail render failed for ${documentId}:`, err);
        setFailed(true);
      });
    return () => {
      cancelled.current = true;
    };
    // Re-render only if the document switches (e.g. parent re-keyed) — width
    // changes mid-life would be unusual and re-running render is expensive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  return (
    <Container $width={width}>
      {src ? <Img src={src} alt="" /> : failed ? <Fallback /> : <Spinner spin />}
    </Container>
  );
}
