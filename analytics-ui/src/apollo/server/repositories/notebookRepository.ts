import { Knex } from 'knex';
import { BaseRepository, IBasicRepository } from './baseRepository';

export interface Notebook {
  id: number;
  projectId: number;
  name: string;
  createdBy: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface NotebookWithStats extends Notebook {
  documentCount: number;
}

export interface INotebookRepository extends IBasicRepository<Notebook> {
  findByProjectId(projectId: number): Promise<NotebookWithStats[]>;
}

export class NotebookRepository
  extends BaseRepository<Notebook>
  implements INotebookRepository
{
  constructor(knexPg: Knex) {
    super({ knexPg, tableName: 'notebook' });
  }

  public async findByProjectId(
    projectId: number,
  ): Promise<NotebookWithStats[]> {
    const rows = await this.knex('notebook')
      .select(
        'notebook.*',
        this.knex.raw(
          'COALESCE((SELECT COUNT(*) FROM document WHERE document.notebook_id = notebook.id), 0) as document_count',
        ),
      )
      .where('notebook.project_id', projectId)
      .orderBy('notebook.created_at', 'desc');

    return rows.map((row) => ({
      ...this.transformFromDBData(row),
      documentCount: Number(row.document_count) || 0,
    }));
  }

  protected transformFromDBData = (data: any): Notebook => ({
    id: data.id,
    projectId: data.project_id,
    name: data.name,
    createdBy: data.created_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  });
}
