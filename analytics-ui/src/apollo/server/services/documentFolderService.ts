import { getLogger } from '@server/utils';
import {
  DocumentFolderRepository,
  DocumentFolder,
  DocumentRepository,
  Document,
} from '@server/repositories';

const logger = getLogger('DocumentFolderService');

/** Hard cap on nesting depth. Five levels handles realistic taxonomies
 *  (e.g. `Tax / 2026 / Q1 / Receipts / Vendor X`) without letting the UI
 *  breadcrumb run off-screen. Enforced in `moveFolder` / `createFolder`. */
const MAX_FOLDER_DEPTH = 5;

/** Soft cap. Past this, folder management itself becomes the pain point. */
const MAX_FOLDERS_PER_WORKSPACE = 200;

/** Strategy when deleting a folder that still contains items. */
export type DeleteFolderStrategy =
  | 'move-to-parent' // children + docs become siblings of the deleted folder
  | 'delete-all'; // subtree dropped + contained docs unlinked from any folder

export class DocumentFolderService {
  private readonly documentFolderRepository: DocumentFolderRepository;
  private readonly documentRepository: DocumentRepository;

  constructor({
    documentFolderRepository,
    documentRepository,
  }: {
    documentFolderRepository: DocumentFolderRepository;
    documentRepository: DocumentRepository;
  }) {
    this.documentFolderRepository = documentFolderRepository;
    this.documentRepository = documentRepository;
  }

  public async listChildren(
    parentFolderId: number | null,
  ): Promise<DocumentFolder[]> {
    return this.documentFolderRepository.findByParent(parentFolderId);
  }

  public async listAll(): Promise<DocumentFolder[]> {
    return this.documentFolderRepository.findAllOrdered();
  }

  public async getBreadcrumb(folderId: number): Promise<DocumentFolder[]> {
    return this.documentFolderRepository.getAncestors(folderId);
  }

  /** Counts of everything that lives under `folderId` — direct children
   *  + their descendants, plus all documents tagged with any folder in
   *  that subtree. Used by the delete-folder modal so the warning
   *  reflects the *real* blast radius, not just what's currently on
   *  screen. */
  public async getSubtreeStats(folderId: number): Promise<{
    childFolderCount: number;
    documentCount: number;
  }> {
    const all = await this.documentFolderRepository.findAll();
    const childrenByParent = new Map<number, DocumentFolder[]>();
    for (const f of all) {
      if (f.parentFolderId == null) continue;
      const list = childrenByParent.get(f.parentFolderId) || [];
      list.push(f);
      childrenByParent.set(f.parentFolderId, list);
    }

    // BFS to gather every descendant id. Visited set guards against
    // any cycles in the data (writes reject them, but reads should be
    // defensive).
    const descendantIds = new Set<number>();
    const queue: number[] = [folderId];
    while (queue.length) {
      const current = queue.shift()!;
      for (const child of childrenByParent.get(current) || []) {
        if (!descendantIds.has(child.id)) {
          descendantIds.add(child.id);
          queue.push(child.id);
        }
      }
    }

    const documentCount = await this.documentRepository.countByFolders([
      folderId,
      ...descendantIds,
    ]);
    return { childFolderCount: descendantIds.size, documentCount };
  }

  public async createFolder(input: {
    name: string;
    parentFolderId: number | null;
    createdBy?: number | null;
  }): Promise<DocumentFolder> {
    const name = (input.name || '').trim();
    if (!name) throw new Error('Folder name is required');
    if (name.length > 100) {
      throw new Error('Folder name must be 100 characters or fewer');
    }

    // Enforce workspace-wide cap before touching the depth math. Use a
    // COUNT(*) so we don't pull every row just to read its length.
    const total = await this.documentFolderRepository.countAll();
    if (total >= MAX_FOLDERS_PER_WORKSPACE) {
      throw new Error(
        `Folder limit reached (${MAX_FOLDERS_PER_WORKSPACE}). Delete some folders before creating more.`,
      );
    }

    if (input.parentFolderId != null) {
      const parent = await this.documentFolderRepository.findOneBy({
        id: input.parentFolderId,
      } as Partial<DocumentFolder>);
      if (!parent) throw new Error('Parent folder not found');

      // New folder's depth = parentDepth + 1. Reject when it would
      // exceed MAX_FOLDER_DEPTH. Mirrors the `>` check in moveFolder so
      // both code paths use the same upper bound.
      const parentDepth = await this.depthOf(input.parentFolderId);
      if (parentDepth + 1 > MAX_FOLDER_DEPTH) {
        throw new Error(
          `Maximum nesting depth (${MAX_FOLDER_DEPTH}) reached at this location`,
        );
      }
    }

    return this.documentFolderRepository.createOne({
      name,
      parentFolderId: input.parentFolderId,
      createdBy: input.createdBy ?? null,
    } as Partial<DocumentFolder>);
  }

  public async renameFolder(
    folderId: number,
    name: string,
  ): Promise<DocumentFolder> {
    const trimmed = (name || '').trim();
    if (!trimmed) throw new Error('Folder name is required');
    if (trimmed.length > 100) {
      throw new Error('Folder name must be 100 characters or fewer');
    }
    const existing = await this.documentFolderRepository.findOneBy({
      id: folderId,
    } as Partial<DocumentFolder>);
    if (!existing) throw new Error('Folder not found');
    return this.documentFolderRepository.updateOne(folderId, {
      name: trimmed,
    } as Partial<DocumentFolder>);
  }

  /** Move folder under a new parent (or to root when `null`). Rejects
   *  cycles (a folder cannot become its own descendant) and depth
   *  violations. */
  public async moveFolder(
    folderId: number,
    newParentId: number | null,
  ): Promise<DocumentFolder> {
    const folder = await this.documentFolderRepository.findOneBy({
      id: folderId,
    } as Partial<DocumentFolder>);
    if (!folder) throw new Error('Folder not found');

    if (newParentId === folderId) {
      throw new Error('A folder cannot be its own parent');
    }

    if (newParentId != null) {
      // Walk up from the proposed parent — if we hit `folderId`, the move
      // would create a cycle.
      const ancestors = await this.documentFolderRepository.getAncestors(
        newParentId,
      );
      if (ancestors.some((a) => a.id === folderId)) {
        throw new Error(
          'Cannot move a folder into one of its own descendants',
        );
      }

      // Depth check: subtree depth must fit under new parent.
      const subtreeDepth = await this.subtreeDepthOf(folderId);
      const parentDepth = await this.depthOf(newParentId);
      // parentDepth is 1-indexed root depth, subtreeDepth includes self
      if (parentDepth + subtreeDepth > MAX_FOLDER_DEPTH) {
        throw new Error(
          `Move would exceed maximum nesting depth of ${MAX_FOLDER_DEPTH}`,
        );
      }
    }

    return this.documentFolderRepository.updateOne(folderId, {
      parentFolderId: newParentId,
    } as Partial<DocumentFolder>);
  }

  /** Delete a folder. Strategy chooses what happens to its contents:
   *    - 'move-to-parent': children folders and contained docs are
   *      reparented to the deleted folder's parent. All reparenting +
   *      the delete itself run in a single transaction — a crash
   *      half-way through must not leave orphan rows pointing at the
   *      doomed folder id.
   *    - 'delete-all': subtree is dropped (ON DELETE CASCADE on the FK
   *      handles child folders); docs in the subtree have folder_id
   *      reset to NULL (ON DELETE SET NULL). */
  public async deleteFolder(
    folderId: number,
    strategy: DeleteFolderStrategy,
  ): Promise<void> {
    const folder = await this.documentFolderRepository.findOneBy({
      id: folderId,
    } as Partial<DocumentFolder>);
    if (!folder) throw new Error('Folder not found');

    if (strategy === 'move-to-parent') {
      const targetParent = folder.parentFolderId;
      const tx = await this.documentFolderRepository.transaction();
      try {
        // Reparent child folders.
        const children = await this.documentFolderRepository.findByParent(
          folderId,
          { tx },
        );
        for (const child of children) {
          await this.documentFolderRepository.updateOne(
            child.id,
            { parentFolderId: targetParent } as Partial<DocumentFolder>,
            { tx },
          );
        }
        // Reparent docs directly under this folder.
        const docs = await this.documentRepository.findByFolder(folderId, {
          tx,
        });
        for (const doc of docs) {
          await this.documentRepository.updateOne(
            doc.id,
            { folderId: targetParent } as Partial<Document>,
            { tx },
          );
        }
        await this.documentFolderRepository.deleteOne(folderId, { tx });
        await this.documentFolderRepository.commit(tx);
      } catch (err) {
        await this.documentFolderRepository.rollback(tx);
        throw err;
      }
      return;
    }

    // For 'delete-all', the cascade FKs handle the rest:
    //   - document_folders ON DELETE CASCADE -> child folders dropped
    //   - documents.folder_id ON DELETE SET NULL -> docs become root-level
    // (knexfile + runtime knex enable PRAGMA foreign_keys = ON for SQLite.)
    await this.documentFolderRepository.deleteOne(folderId);
  }

  /** Move a single document to a folder (or to root via `null`). */
  public async moveDocument(
    documentId: string,
    folderId: number | null,
  ): Promise<Document> {
    const doc = await this.documentRepository.findOneBy({
      id: documentId,
    } as Partial<Document>);
    if (!doc) throw new Error('Document not found');

    if (folderId != null) {
      const folder = await this.documentFolderRepository.findOneBy({
        id: folderId,
      } as Partial<DocumentFolder>);
      if (!folder) throw new Error('Target folder not found');
    }

    return this.documentRepository.updateOne(documentId, {
      folderId,
    } as Partial<Document>);
  }

  // ── internals ──────────────────────────────────────────────────────────

  /** 1-indexed depth: root-level folder = 1. */
  private async depthOf(folderId: number): Promise<number> {
    const ancestors = await this.documentFolderRepository.getAncestors(folderId);
    return ancestors.length;
  }

  /** Returns 1 for a leaf folder, +1 per nested level. Iterative + uses
   *  a visited set so a corrupt cycle in the DB can't blow the stack —
   *  the service rejects cycles on writes, but defensive reads matter
   *  when migrating from older data or after manual SQL edits. */
  private async subtreeDepthOf(folderId: number): Promise<number> {
    const all = await this.documentFolderRepository.findAll();
    const childrenByParent = new Map<number, DocumentFolder[]>();
    for (const f of all) {
      if (f.parentFolderId == null) continue;
      const list = childrenByParent.get(f.parentFolderId) || [];
      list.push(f);
      childrenByParent.set(f.parentFolderId, list);
    }

    // DFS depth from `folderId`, capped at MAX_FOLDER_DEPTH so a cycle
    // is bounded even if `visited` somehow misses it.
    const visited = new Set<number>();
    const walk = (id: number, depth: number): number => {
      if (visited.has(id) || depth > MAX_FOLDER_DEPTH) return depth;
      visited.add(id);
      const children = childrenByParent.get(id) || [];
      if (children.length === 0) return depth;
      let max = depth;
      for (const c of children) {
        const d = walk(c.id, depth + 1);
        if (d > max) max = d;
      }
      return max;
    };

    // Subtree depth is relative: leaf = 1, +1 per nested level.
    return walk(folderId, 1);
  }
}
