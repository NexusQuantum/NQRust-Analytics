/**
 * Local-filesystem storage for uploaded documents.
 *
 * Files are written under <root>/<projectId>/<docId>.<ext>. Wrapped in a
 * narrow interface so the implementation can later be swapped for S3/MinIO
 * without touching callers.
 */
import * as fs from 'fs';
import * as path from 'path';
import { getConfig } from '@server/config';

export interface IDocumentStorage {
  /** Move/copy a file from a temp source path into permanent storage; returns the relative storage path. */
  save(opts: {
    projectId: number;
    documentIdHint: string;
    extension: string;
    sourcePath: string;
  }): Promise<string>;
  /** Resolve a relative storage path to an absolute filesystem path. */
  absolutePath(relativePath: string): string;
  /** Delete a file at the given relative storage path (best-effort). */
  remove(relativePath: string): Promise<void>;
}

export class LocalDocumentStorage implements IDocumentStorage {
  private root: string;

  constructor(rootDir?: string) {
    const config = getConfig();
    this.root =
      rootDir ||
      process.env.DOCUMENT_STORAGE_DIR ||
      path.join(
        config.persistCredentialDir || path.join(process.cwd(), '.tmp'),
        'documents',
      );
    fs.mkdirSync(this.root, { recursive: true });
  }

  public async save({
    projectId,
    documentIdHint,
    extension,
    sourcePath,
  }: {
    projectId: number;
    documentIdHint: string;
    extension: string;
    sourcePath: string;
  }): Promise<string> {
    const projectDir = path.join(this.root, String(projectId));
    fs.mkdirSync(projectDir, { recursive: true });
    const ext = extension.startsWith('.') ? extension : `.${extension}`;
    const filename = `${documentIdHint}${ext}`;
    const dest = path.join(projectDir, filename);
    await fs.promises.copyFile(sourcePath, dest);
    // Best-effort cleanup of the temp source
    try {
      await fs.promises.unlink(sourcePath);
    } catch {
      // ignore
    }
    // Store the relative path so it stays portable across hosts.
    return path.relative(this.root, dest).replace(/\\/g, '/');
  }

  public absolutePath(relativePath: string): string {
    return path.join(this.root, relativePath);
  }

  public async remove(relativePath: string): Promise<void> {
    try {
      await fs.promises.unlink(this.absolutePath(relativePath));
    } catch {
      // ignore
    }
  }

  /** Read-only accessor for tests / debugging. */
  public get rootDir(): string {
    return this.root;
  }
}

let _instance: LocalDocumentStorage | null = null;
export function getDocumentStorage(): IDocumentStorage {
  if (!_instance) _instance = new LocalDocumentStorage();
  return _instance;
}
