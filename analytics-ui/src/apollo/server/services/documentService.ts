import {
  IDocumentRepository,
  IDocumentSelectionRepository,
  DocumentRecord,
  DocumentStatus,
} from '@server/repositories';
import { getLogger } from '@server/utils';

const logger = getLogger('DocumentService');

export const DOCUMENT_LIMITS = {
  MAX_FILE_BYTES: 30 * 1024 * 1024, // 30 MB
  MAX_PAGE_COUNT: 500,
  MAX_DOCS_PER_NOTEBOOK: 30,
  MAX_SELECTED_AT_ONCE: 10,
} as const;

export interface CreateDocumentInput {
  notebookId: number;
  filename: string;
  originalFilename: string;
  storagePath: string;
  mimeType: string;
  size: number;
  hash: string;
}

export interface IDocumentService {
  listByNotebook(notebookId: number): Promise<DocumentRecord[]>;
  getById(id: number): Promise<DocumentRecord | null>;
  create(
    input: CreateDocumentInput,
    userId: number | null,
  ): Promise<DocumentRecord>;
  updateStatus(
    id: number,
    status: DocumentStatus,
    extra?: Partial<DocumentRecord>,
  ): Promise<void>;
  delete(id: number): Promise<DocumentRecord | null>;
  /** Returns currently-selected document IDs for the user in the notebook. */
  getSelectedIds(notebookId: number, userId: number): Promise<number[]>;
  /** Map docId -> selected for the user (used to populate UI checkboxes). */
  getSelectionMap(
    notebookId: number,
    userId: number,
  ): Promise<Record<number, boolean>>;
  /** Toggle/set checkbox; enforces max-selected limit on positive transitions. */
  setSelection(
    notebookId: number,
    documentId: number,
    userId: number,
    selected: boolean,
  ): Promise<void>;
}

export class DocumentService implements IDocumentService {
  private documentRepository: IDocumentRepository;
  private selectionRepository: IDocumentSelectionRepository;

  constructor({
    documentRepository,
    selectionRepository,
  }: {
    documentRepository: IDocumentRepository;
    selectionRepository: IDocumentSelectionRepository;
  }) {
    this.documentRepository = documentRepository;
    this.selectionRepository = selectionRepository;
  }

  public async listByNotebook(
    notebookId: number,
  ): Promise<DocumentRecord[]> {
    return this.documentRepository.findByNotebookId(notebookId);
  }

  public async getById(id: number): Promise<DocumentRecord | null> {
    return this.documentRepository.findOneBy({ id });
  }

  public async create(
    input: CreateDocumentInput,
    userId: number | null,
  ): Promise<DocumentRecord> {
    const count = await this.documentRepository.countByNotebookId(
      input.notebookId,
    );
    if (count >= DOCUMENT_LIMITS.MAX_DOCS_PER_NOTEBOOK) {
      throw new Error(
        `Notebook already has ${count} documents (max ${DOCUMENT_LIMITS.MAX_DOCS_PER_NOTEBOOK}).`,
      );
    }

    const created = await this.documentRepository.createOne({
      notebookId: input.notebookId,
      filename: input.filename,
      originalFilename: input.originalFilename,
      storagePath: input.storagePath,
      mimeType: input.mimeType,
      size: input.size,
      hash: input.hash,
      status: 'uploading',
      uploadedBy: userId,
    });
    logger.debug(`Document created: id=${created.id} notebook=${input.notebookId}`);
    return created;
  }

  public async updateStatus(
    id: number,
    status: DocumentStatus,
    extra: Partial<DocumentRecord> = {},
  ): Promise<void> {
    await this.documentRepository.updateStatus(id, status, extra);
  }

  public async delete(id: number): Promise<DocumentRecord | null> {
    const doc = await this.documentRepository.findOneBy({ id });
    if (!doc) return null;
    // The actual file unlink + Qdrant cleanup happens in the resolver
    // so it can call the AI service adaptor; this just removes the row.
    await this.documentRepository.deleteOne(id);
    logger.debug(`Document row deleted: id=${id}`);
    return doc;
  }

  public async getSelectedIds(
    notebookId: number,
    userId: number,
  ): Promise<number[]> {
    return this.selectionRepository.selectedDocumentIds(notebookId, userId);
  }

  public async getSelectionMap(
    notebookId: number,
    userId: number,
  ): Promise<Record<number, boolean>> {
    return this.selectionRepository.selectionMap(notebookId, userId);
  }

  public async setSelection(
    notebookId: number,
    documentId: number,
    userId: number,
    selected: boolean,
  ): Promise<void> {
    if (selected) {
      const current = await this.selectionRepository.countSelected(
        notebookId,
        userId,
      );
      // Only enforce if this would be a new selection (not toggling off).
      const map = await this.selectionRepository.selectionMap(
        notebookId,
        userId,
      );
      const wasSelected = !!map[documentId];
      if (!wasSelected && current >= DOCUMENT_LIMITS.MAX_SELECTED_AT_ONCE) {
        throw new Error(
          `Maximum ${DOCUMENT_LIMITS.MAX_SELECTED_AT_ONCE} documents can be selected at once.`,
        );
      }
    }
    await this.selectionRepository.setSelection(
      notebookId,
      documentId,
      userId,
      selected,
    );
  }
}
