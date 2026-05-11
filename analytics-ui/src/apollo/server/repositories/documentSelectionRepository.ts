import { Knex } from 'knex';
import { BaseRepository } from './baseRepository';

export interface DocumentSelection {
  id: number;
  documentId: string;
  selectedAt: Date;
}

export class DocumentSelectionRepository extends BaseRepository<DocumentSelection> {
  constructor({ knexPg }: { knexPg: Knex }) {
    super({ knexPg, tableName: 'document_selections' });
  }

  public async getSelectedDocumentIds(): Promise<string[]> {
    const rows = await this.findAll();
    return rows.map((r) => r.documentId);
  }

  public async setSelection(documentIds: string[]): Promise<void> {
    await this.knex('document_selections').delete();
    if (documentIds.length === 0) return;

    await this.knex('document_selections').insert(
      documentIds.map((id) => ({ document_id: id })),
    );
  }

  public async addToSelection(documentId: string): Promise<void> {
    const existing = await this.findOneBy({
      documentId,
    } as Partial<DocumentSelection>);
    if (!existing) {
      await this.createOne({ documentId } as Partial<DocumentSelection>);
    }
  }

  public async removeFromSelection(documentId: string): Promise<void> {
    await this.deleteAllBy({ documentId } as Partial<DocumentSelection>);
  }
}
