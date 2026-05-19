// Single source of truth for document RAG accepted formats.
//
// Used by:
//   - server upload endpoint (formidable filter)
//   - server documentService (validation before saving)
//   - UI UploadDialog (file picker accept attr + client-side validation)
//   - SourceItem (icon resolution)
//
// Keep additions here only. If a fourth file ever needs to know "is this
// extension allowed", import from here rather than duplicating the list.

export const ALLOWED_DOCUMENT_MIME_TYPES: readonly string[] = [
  'application/pdf',
  'text/markdown',
  'text/x-markdown',
  // Some browsers / OSes send .md files as text/plain or octet-stream;
  // callers should fall back to the extension check below.
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
] as const;

export const ALLOWED_DOCUMENT_EXTS: readonly string[] = [
  '.pdf',
  '.md',
  '.markdown',
  '.docx',
  '.pptx',
] as const;

// File-picker accept attribute — covers both extension and mime for cross-OS
// reliability. Spreads back into an array each call so consumers can't mutate
// the source-of-truth arrays.
export const DOCUMENT_ACCEPT_ATTR: string = [
  ...ALLOWED_DOCUMENT_EXTS,
  ...ALLOWED_DOCUMENT_MIME_TYPES,
].join(',');

/**
 * Default upload size cap in megabytes. The server reads its actual cap
 * from `config.documentMaxSizeMb` (with `DOCUMENT_MAX_SIZE_MB` env override),
 * but the UI is a static bundle and can't see env vars, so it falls back to
 * this constant for client-side pre-validation. Server validation is the
 * authoritative check; the client value is only a UX nicety.
 *
 * Keep this in sync with the default in
 * `analytics-ui/src/apollo/server/config.ts`.
 */
export const DEFAULT_DOCUMENT_MAX_SIZE_MB = 50;

/** Lowercase, dot-prefixed extension; empty string when there is no dot. */
export function extensionOf(filename: string): string {
  if (!filename) return '';
  const i = filename.lastIndexOf('.');
  if (i <= 0) return ''; // no dot OR dot at index 0 ("hidden file with no ext")
  return filename.slice(i).toLowerCase();
}

/**
 * Whether a file is acceptable based on its mime OR extension.
 * Either signal is sufficient; this is by design (browsers send unreliable
 * mimes for .md / .docx / .pptx and we'd rather accept than over-reject).
 */
export function isAllowedDocument(
  mimeType: string | null | undefined,
  filename: string | null | undefined,
): boolean {
  if (mimeType && ALLOWED_DOCUMENT_MIME_TYPES.includes(mimeType)) return true;
  const ext = extensionOf(filename ?? '');
  return ext !== '' && ALLOWED_DOCUMENT_EXTS.includes(ext);
}
