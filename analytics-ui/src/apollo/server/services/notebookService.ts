import {
  INotebookRepository,
  Notebook,
  NotebookWithStats,
} from '@server/repositories';
import { getLogger } from '@server/utils';

const logger = getLogger('NotebookService');

export interface CreateNotebookInput {
  projectId: number;
  name: string;
}

export interface INotebookService {
  list(projectId: number): Promise<NotebookWithStats[]>;
  getById(id: number): Promise<Notebook | null>;
  create(
    input: CreateNotebookInput,
    userId: number | null,
  ): Promise<NotebookWithStats>;
  rename(id: number, name: string): Promise<NotebookWithStats>;
  delete(id: number): Promise<void>;
}

export class NotebookService implements INotebookService {
  private notebookRepository: INotebookRepository;

  constructor({
    notebookRepository,
  }: {
    notebookRepository: INotebookRepository;
  }) {
    this.notebookRepository = notebookRepository;
  }

  public async list(projectId: number): Promise<NotebookWithStats[]> {
    return this.notebookRepository.findByProjectId(projectId);
  }

  public async getById(id: number): Promise<Notebook | null> {
    return this.notebookRepository.findOneBy({ id });
  }

  public async create(
    input: CreateNotebookInput,
    userId: number | null,
  ): Promise<NotebookWithStats> {
    const created = await this.notebookRepository.createOne({
      projectId: input.projectId,
      name: input.name,
      createdBy: userId,
    });
    logger.debug(`Notebook created: id=${created.id} project=${input.projectId}`);
    return { ...created, documentCount: 0 };
  }

  public async rename(
    id: number,
    name: string,
  ): Promise<NotebookWithStats> {
    const updated = await this.notebookRepository.updateOne(id, { name });
    // documentCount unchanged by rename; fetch via repository for accuracy.
    const list = await this.notebookRepository.findByProjectId(
      updated.projectId,
    );
    const fresh = list.find((n) => n.id === updated.id);
    return fresh || { ...updated, documentCount: 0 };
  }

  public async delete(id: number): Promise<void> {
    // Cascade-delete docs/selections handled by FK ON DELETE CASCADE.
    await this.notebookRepository.deleteOne(id);
    logger.debug(`Notebook deleted: id=${id}`);
  }
}
