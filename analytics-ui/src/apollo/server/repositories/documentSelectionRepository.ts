import { Knex } from 'knex';

export interface DocumentSelection {
  notebookId: number;
  documentId: number;
  userId: number;
  selected: boolean;
  updatedAt?: Date;
}

export interface IDocumentSelectionRepository {
  /** Per-user selected document IDs in a notebook */
  selectedDocumentIds(notebookId: number, userId: number): Promise<number[]>;
  /** Number of currently-selected docs for a user in a notebook */
  countSelected(notebookId: number, userId: number): Promise<number>;
  /** Set checkbox state for one (notebook, document, user) tuple */
  setSelection(
    notebookId: number,
    documentId: number,
    userId: number,
    selected: boolean,
  ): Promise<void>;
  /** Map of {documentId -> selected} for the given user in the notebook */
  selectionMap(
    notebookId: number,
    userId: number,
  ): Promise<Record<number, boolean>>;
}

export class DocumentSelectionRepository
  implements IDocumentSelectionRepository
{
  constructor(private knex: Knex) {}

  public async selectedDocumentIds(
    notebookId: number,
    userId: number,
  ): Promise<number[]> {
    const rows = await this.knex('document_selection')
      .select('document_id')
      .where({ notebook_id: notebookId, user_id: userId, selected: true });
    return rows.map((r) => Number(r.document_id));
  }

  public async countSelected(
    notebookId: number,
    userId: number,
  ): Promise<number> {
    const row = await this.knex('document_selection')
      .where({ notebook_id: notebookId, user_id: userId, selected: true })
      .count<{ c: string | number }>({ c: '*' })
      .first();
    return Number(row?.c ?? 0);
  }

  public async setSelection(
    notebookId: number,
    documentId: number,
    userId: number,
    selected: boolean,
  ): Promise<void> {
    // Upsert via raw to avoid dialect-specific conflicts. Two-step is fine
    // because the composite PK guarantees at most one row exists per tuple.
    const existing = await this.knex('document_selection')
      .where({
        notebook_id: notebookId,
        document_id: documentId,
        user_id: userId,
      })
      .first();

    if (existing) {
      await this.knex('document_selection')
        .where({
          notebook_id: notebookId,
          document_id: documentId,
          user_id: userId,
        })
        .update({ selected, updated_at: this.knex.fn.now() });
    } else {
      await this.knex('document_selection').insert({
        notebook_id: notebookId,
        document_id: documentId,
        user_id: userId,
        selected,
      });
    }
  }

  public async selectionMap(
    notebookId: number,
    userId: number,
  ): Promise<Record<number, boolean>> {
    const rows = await this.knex('document_selection')
      .select('document_id', 'selected')
      .where({ notebook_id: notebookId, user_id: userId });
    const out: Record<number, boolean> = {};
    for (const r of rows) {
      out[Number(r.document_id)] = Boolean(r.selected);
    }
    return out;
  }
}
