import { Knex } from 'knex';
import { BaseRepository } from './baseRepository';

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
}
