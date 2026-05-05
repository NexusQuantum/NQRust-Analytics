import { Knex } from 'knex';
import { BaseRepository, IBasicRepository } from './baseRepository';

export type DocumentStatus =
  | 'uploading'
  | 'parsing'
  | 'embedding'
  | 'ready'
  | 'failed';

export interface DocumentRecord {
  id: number;
  notebookId: number;
  filename: string;
  originalFilename: string;
  storagePath: string;
  mimeType: string;
  size: number;
  hash: string;
  pageCount: number | null;
  status: DocumentStatus;
  errorMessage: string | null;
  qdrantIndexedAt: Date | null;
  uploadedBy: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IDocumentRepository extends IBasicRepository<DocumentRecord> {
  findByNotebookId(notebookId: number): Promise<DocumentRecord[]>;
  countByNotebookId(notebookId: number): Promise<number>;
  findByHashInNotebook(
    notebookId: number,
    hash: string,
  ): Promise<DocumentRecord | null>;
  updateStatus(
    id: number,
    status: DocumentStatus,
    extra?: Partial<DocumentRecord>,
  ): Promise<void>;
}

export class DocumentRepository
  extends BaseRepository<DocumentRecord>
  implements IDocumentRepository
{
  constructor(knexPg: Knex) {
    super({ knexPg, tableName: 'document' });
  }

  public async findByNotebookId(notebookId: number): Promise<DocumentRecord[]> {
    const rows = await this.knex('document')
      .where({ notebook_id: notebookId })
      .orderBy('created_at', 'desc');
    return rows.map((r) => this.transformFromDBData(r));
  }

  public async countByNotebookId(notebookId: number): Promise<number> {
    const row = await this.knex('document')
      .where({ notebook_id: notebookId })
      .count<{ c: string | number }>({ c: '*' })
      .first();
    return Number(row?.c ?? 0);
  }

  public async findByHashInNotebook(
    notebookId: number,
    hash: string,
  ): Promise<DocumentRecord | null> {
    const row = await this.knex('document')
      .where({ notebook_id: notebookId, hash })
      .first();
    return row ? this.transformFromDBData(row) : null;
  }

  public async updateStatus(
    id: number,
    status: DocumentStatus,
    extra: Partial<DocumentRecord> = {},
  ): Promise<void> {
    const update: Record<string, any> = { status, ...this.toDb(extra) };
    update.updated_at = this.knex.fn.now();
    await this.knex('document').where({ id }).update(update);
  }

  // BaseRepository.transformToDBData converts camel→snake, but we sometimes
  // need a partial mapper for ad-hoc updates without going through full schema.
  private toDb(partial: Partial<DocumentRecord>): Record<string, any> {
    const out: Record<string, any> = {};
    if (partial.pageCount !== undefined) out.page_count = partial.pageCount;
    if (partial.errorMessage !== undefined)
      out.error_message = partial.errorMessage;
    if (partial.qdrantIndexedAt !== undefined)
      out.qdrant_indexed_at = partial.qdrantIndexedAt;
    return out;
  }

  protected transformFromDBData = (data: any): DocumentRecord => ({
    id: data.id,
    notebookId: data.notebook_id,
    filename: data.filename,
    originalFilename: data.original_filename,
    storagePath: data.storage_path,
    mimeType: data.mime_type,
    size: Number(data.size),
    hash: data.hash,
    pageCount: data.page_count,
    status: data.status,
    errorMessage: data.error_message,
    qdrantIndexedAt: data.qdrant_indexed_at,
    uploadedBy: data.uploaded_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  });
}
