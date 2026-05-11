import { Knex } from 'knex';
import { BaseRepository } from './baseRepository';

export interface DocumentTree {
  id: number;
  documentId: string;
  treeJson: string;
  modelUsed: string | null;
  buildTimeMs: number | null;
  version: number;
  createdAt: Date;
}

export class DocumentTreeRepository extends BaseRepository<DocumentTree> {
  constructor({ knexPg }: { knexPg: Knex }) {
    super({ knexPg, tableName: 'document_trees' });
  }

  public async upsertByDocumentId(
    documentId: string,
    treeJson: string,
    modelUsed?: string,
    buildTimeMs?: number,
  ): Promise<DocumentTree> {
    const existing = await this.findOneBy({
      documentId,
    } as Partial<DocumentTree>);

    if (existing) {
      return this.updateOne(existing.id, {
        treeJson,
        modelUsed: modelUsed ?? null,
        buildTimeMs: buildTimeMs ?? null,
        version: existing.version + 1,
      } as Partial<DocumentTree>);
    }

    return this.createOne({
      documentId,
      treeJson,
      modelUsed: modelUsed ?? null,
      buildTimeMs: buildTimeMs ?? null,
      version: 1,
    } as Partial<DocumentTree>);
  }

  public async getByDocumentId(documentId: string): Promise<DocumentTree | null> {
    return this.findOneBy({ documentId } as Partial<DocumentTree>);
  }
}
