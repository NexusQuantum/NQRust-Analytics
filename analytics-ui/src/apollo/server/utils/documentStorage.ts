import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface SavedFile {
  storagePath: string;
  hash: string;
  size: number;
  filename: string;
}

export function ensureStorageDir(storageDir: string): void {
  fs.mkdirSync(storageDir, { recursive: true });
}

export function hashBuffer(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Save file buffer to storage directory.
 * Uses content-addressable storage (sha256 hash as filename prefix)
 * to automatically deduplicate identical files.
 */
export function saveFile(
  buffer: Buffer,
  originalFilename: string,
  storageDir: string,
): SavedFile {
  ensureStorageDir(storageDir);

  const hash = hashBuffer(buffer);
  const ext = path.extname(originalFilename).toLowerCase() || '.pdf';
  const safeBasename = path
    .basename(originalFilename, ext)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 50);
  const filename = `${hash.substring(0, 16)}_${safeBasename}${ext}`;
  const storagePath = path.join(storageDir, filename);

  if (!fs.existsSync(storagePath)) {
    fs.writeFileSync(storagePath, buffer);
  }

  return {
    storagePath,
    hash,
    size: buffer.length,
    filename,
  };
}

export function deleteFile(storagePath: string): void {
  if (fs.existsSync(storagePath)) {
    fs.unlinkSync(storagePath);
  }
}

export function getFileBuffer(storagePath: string): Buffer {
  return fs.readFileSync(storagePath);
}
