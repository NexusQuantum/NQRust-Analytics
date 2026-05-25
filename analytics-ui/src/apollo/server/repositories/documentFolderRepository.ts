import { Knex } from 'knex';
import { BaseRepository, IQueryOptions } from './baseRepository';

export interface DocumentFolder {
  id: number;
  name: string;
  parentFolderId: number | null;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export class DocumentFolderRepository extends BaseRepository<DocumentFolder> {
  constructor({ knexPg }: { knexPg: Knex }) {
    super({ knexPg, tableName: 'document_folders' });
  }

  /** Children folders directly under `parentFolderId` (NULL = root).
   *  `tx` is accepted so callers in a transaction observe the same
   *  snapshot they're about to mutate. */
  public async findByParent(
    parentFolderId: number | null,
    queryOptions?: IQueryOptions,
  ): Promise<DocumentFolder[]> {
    const executer = queryOptions?.tx ? queryOptions.tx : this.knex;
    const rows = await executer(this.tableName)
      .where(
        parentFolderId === null
          ? { parent_folder_id: null }
          : { parent_folder_id: parentFolderId },
      )
      .orderBy('name', 'asc');
    return rows.map((r) => this.transformFromDBData(r));
  }

  /** All folders in the workspace — used for "Move to..." picker. */
  public async findAllOrdered(): Promise<DocumentFolder[]> {
    const rows = await this.knex(this.tableName).orderBy('name', 'asc');
    return rows.map((r) => this.transformFromDBData(r));
  }

  /** COUNT(*) — used by the workspace cap check so we don't pull every
   *  row just to read its length. */
  public async countAll(): Promise<number> {
    const [{ count }] = await this.knex(this.tableName).count<{ count: string | number }[]>({
      count: '*',
    });
    return typeof count === 'string' ? Number.parseInt(count, 10) : Number(count);
  }

  /** Walk parent chain from `folderId` up to root. Returns ordered list
   *  [root, ..., self]. Used by the breadcrumb. Caps at 10 hops as a
   *  safety net against corrupted cycles (shouldn't happen — the
   *  service rejects them — but cheap insurance). */
  public async getAncestors(folderId: number): Promise<DocumentFolder[]> {
    const chain: DocumentFolder[] = [];
    let cursor: number | null = folderId;
    let hops = 0;
    while (cursor != null && hops < 10) {
      const folder = await this.findOneBy({ id: cursor } as Partial<DocumentFolder>);
      if (!folder) break;
      chain.unshift(folder);
      cursor = folder.parentFolderId;
      hops++;
    }
    return chain;
  }
}
