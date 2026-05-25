import { Knex } from 'knex';
import { BaseRepository, IQueryOptions } from './baseRepository';

export interface Document {
  id: string;
  filename: string;
  originalFilename: string;
  storagePath: string;
  mimeType: string;
  size: number;
  hash: string;
  pageCount: number | null;
  status: 'pending' | 'indexing' | 'indexed' | 'failed';
  errorMessage: string | null;
  indexedAt: Date | null;
  fallbackUsed: boolean;
  folderId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export class DocumentRepository extends BaseRepository<Document> {
  constructor({ knexPg }: { knexPg: Knex }) {
    super({ knexPg, tableName: 'documents' });
  }

  public async findByHash(hash: string): Promise<Document | null> {
    return this.findOneBy({ hash } as Partial<Document>);
  }

  public async updateStatus(
    id: string,
    status: Document['status'],
    extra: Partial<Document> = {},
  ): Promise<Document> {
    return this.updateOne(id, { status, ...extra } as Partial<Document>);
  }

  /** Documents in a specific folder. `null` = root-level (uncategorized).
   *  This is a dedicated method instead of `findAllBy({folderId: null})`
   *  because Knex's `.where({col: null})` becomes `WHERE col = NULL`
   *  (always false in SQL) rather than `IS NULL`. */
  public async findByFolder(
    folderId: number | null,
    queryOptions?: IQueryOptions,
  ): Promise<Document[]> {
    const executer = queryOptions?.tx ? queryOptions.tx : this.knex;
    const rows = await executer(this.tableName)
      .where(folderId === null ? { folder_id: null } : { folder_id: folderId })
      .orderBy('created_at', 'asc');
    return rows.map((r) => this.transformFromDBData(r));
  }

  /** COUNT(*) WHERE folder_id IS … — used by the folder delete modal
   *  so users see the *actual* subtree count, not just what's loaded
   *  in the current view. */
  public async countByFolder(folderId: number | null): Promise<number> {
    const [{ count }] = await this.knex(this.tableName)
      .where(folderId === null ? { folder_id: null } : { folder_id: folderId })
      .count<{ count: string | number }[]>({ count: '*' });
    return typeof count === 'string' ? Number.parseInt(count, 10) : Number(count);
  }

  /** COUNT(*) WHERE folder_id IN (…). Empty list returns 0 without
   *  touching the DB — Knex would otherwise emit `WHERE folder_id IN ()`
   *  which Postgres rejects. */
  public async countByFolders(folderIds: number[]): Promise<number> {
    if (folderIds.length === 0) return 0;
    const [{ count }] = await this.knex(this.tableName)
      .whereIn('folder_id', folderIds)
      .count<{ count: string | number }[]>({ count: '*' });
    return typeof count === 'string' ? Number.parseInt(count, 10) : Number(count);
  }
}
