import { v4 as uuidv4 } from 'uuid';
import { IConfig } from '@server/config';
import { getLogger } from '@server/utils';
import { saveFile, deleteFile } from '@server/utils/documentStorage';
import {
  DocumentRepository,
  DocumentTreeRepository,
  DocumentSelectionRepository,
  Document,
} from '@server/repositories';
import { IAnalyticsAIAdaptor } from '@server/adaptors';
import { isAllowedDocument } from '@/utils/documentFormats';

const logger = getLogger('DocumentService');

// Whitelist mirrors the AI service routing in page_index_adapter.py:
//   .pdf   → native PageIndex (PyPDF2 + pymupdf)
//   .md    → md_to_tree direct
//   .docx  → mammoth → md_to_tree
//   .pptx  → python-pptx → md_to_tree
// Legacy formats (.doc, .ppt) and tabular data (.xls/.xlsx) are NOT
// supported on purpose — the engine can't index them well.
// The actual lists live in @/utils/documentFormats (shared with UI).

const MAX_FILENAME_LENGTH = 255;
// Soft cap on total documents per install. Beyond this, indexing/listing
// performance starts to suffer and storage can balloon unnoticed. Counts
// every document regardless of status — failed/pending rows still take
// DB rows and (sometimes) on-disk bytes.
const MAX_TOTAL_DOCUMENTS = 100;

export class DocumentService {
  private readonly documentRepository: DocumentRepository;
  private readonly documentTreeRepository: DocumentTreeRepository;
  private readonly documentSelectionRepository: DocumentSelectionRepository;
  private readonly analyticsAIAdaptor: IAnalyticsAIAdaptor;
  private readonly storageDir: string;
  private readonly maxSizeMb: number;
  private readonly maxPages: number;
  private readonly callbackBaseUrl: string;

  constructor({
    documentRepository,
    documentTreeRepository,
    documentSelectionRepository,
    analyticsAIAdaptor,
    config,
    callbackBaseUrl,
  }: {
    documentRepository: DocumentRepository;
    documentTreeRepository: DocumentTreeRepository;
    documentSelectionRepository: DocumentSelectionRepository;
    analyticsAIAdaptor: IAnalyticsAIAdaptor;
    config: IConfig;
    callbackBaseUrl: string;
  }) {
    this.documentRepository = documentRepository;
    this.documentTreeRepository = documentTreeRepository;
    this.documentSelectionRepository = documentSelectionRepository;
    this.analyticsAIAdaptor = analyticsAIAdaptor;
    this.storageDir = config.documentStorageDir || './storage/documents';
    this.maxSizeMb = config.documentMaxSizeMb || 20;
    this.maxPages = config.documentMaxPages || 100;
    this.callbackBaseUrl = callbackBaseUrl;
  }

  public async uploadDocument(
    fileBuffer: Buffer,
    originalFilename: string,
    mimeType: string,
  ): Promise<Document> {
    // Validate
    this.validateFile(fileBuffer, originalFilename, mimeType);

    // Save to disk (content-addressable; dedupes identical files)
    const saved = saveFile(fileBuffer, originalFilename, this.storageDir);

    // Check if already indexed (by hash) — re-upload of an existing file
    // doesn't count against the total cap, so do this BEFORE the cap check.
    const existing = await this.documentRepository.findByHash(saved.hash);
    if (existing && existing.status === 'indexed') {
      logger.info(`Document with hash ${saved.hash} already indexed, reusing`);
      return existing;
    }

    // Enforce total-document cap. Listing/select performance and storage
    // start to suffer beyond a few hundred docs; the cap forces the user
    // to clean up before adding more.
    const all = await this.documentRepository.findAll();
    if (all.length >= MAX_TOTAL_DOCUMENTS) {
      throw new Error(
        `Maximum ${MAX_TOTAL_DOCUMENTS} documents reached (currently ${all.length}). ` +
          `Delete some documents before uploading more.`,
      );
    }

    // Create DB record
    const docId = uuidv4();
    const doc = await this.documentRepository.createOne({
      id: docId,
      filename: saved.filename,
      originalFilename,
      storagePath: saved.storagePath,
      mimeType,
      size: saved.size,
      hash: saved.hash,
      status: 'pending',
    } as Partial<Document>);

    // Trigger async indexing in AI service
    const callbackUrl = `${this.callbackBaseUrl}/api/v1/documents/${docId}/tree`;
    await this.analyticsAIAdaptor.indexDocument({
      documentId: docId,
      filePath: saved.storagePath,
      callbackUrl,
    });

    // Mark as indexing
    await this.documentRepository.updateStatus(docId, 'indexing');

    return { ...doc, status: 'indexing' };
  }

  public async deleteDocument(id: string): Promise<void> {
    const doc = await this.documentRepository.findOneBy({ id } as Partial<Document>);
    if (!doc) return;

    // Remove from selection first
    await this.documentSelectionRepository.removeFromSelection(id);

    // Tell AI service to clear its cache
    await this.analyticsAIAdaptor.deleteDocument(id).catch((err) => {
      logger.warn(`AI service delete failed for ${id}: ${err.message}`);
    });

    // Delete tree record
    await this.documentTreeRepository
      .deleteAllBy({ documentId: id } as any)
      .catch(() => {});

    // Delete document record
    await this.documentRepository.deleteOne(id);

    // Delete file (only if no other document uses the same storage path)
    const sibling = await this.documentRepository.findOneBy({
      storagePath: doc.storagePath,
    } as Partial<Document>);
    if (!sibling) {
      deleteFile(doc.storagePath);
    }
  }

  public async getDocument(id: string): Promise<Document | null> {
    return this.documentRepository.findOneBy({ id } as Partial<Document>);
  }

  public async getAllDocuments(): Promise<Document[]> {
    return this.documentRepository.findAll({ order: 'created_at' });
  }

  public async onIndexingComplete(
    documentId: string,
    treeJson: string,
    pageCount: number,
    modelUsed?: string,
    buildTimeMs?: number,
  ): Promise<void> {
    await this.documentTreeRepository.upsertByDocumentId(
      documentId,
      treeJson,
      modelUsed,
      buildTimeMs,
    );
    await this.documentRepository.updateStatus(documentId, 'indexed', {
      pageCount,
      indexedAt: new Date(),
    } as Partial<Document>);
  }

  public async onIndexingFailed(
    documentId: string,
    errorMessage: string,
  ): Promise<void> {
    await this.documentRepository.updateStatus(documentId, 'failed', {
      errorMessage,
    } as Partial<Document>);
  }

  public async getSelectedDocumentIds(): Promise<string[]> {
    return this.documentSelectionRepository.getSelectedDocumentIds();
  }

  public async setDocumentSelection(documentIds: string[]): Promise<void> {
    if (documentIds.length > 5) {
      throw new Error('Maximum 5 documents can be selected at once');
    }
    await this.documentSelectionRepository.setSelection(documentIds);
  }

  public async getDocumentTree(documentId: string): Promise<object | null> {
    const tree = await this.documentTreeRepository.getByDocumentId(documentId);
    if (!tree) return null;
    try {
      return JSON.parse(tree.treeJson);
    } catch {
      return null;
    }
  }

  private validateFile(
    buffer: Buffer,
    filename: string,
    mimeType: string | null,
  ): void {
    const sizeMb = buffer.length / (1024 * 1024);
    if (sizeMb > this.maxSizeMb) {
      throw new Error(`File too large: ${sizeMb.toFixed(1)}MB (max ${this.maxSizeMb}MB)`);
    }

    // mime OR extension — browsers are unreliable about the mime they
    // send for .md (often text/plain or octet-stream) and sometimes
    // mis-detect .docx/.pptx as octet-stream too. Shared with the UI and
    // the upload endpoint via @/utils/documentFormats.
    if (!isAllowedDocument(mimeType, filename)) {
      throw new Error(
        `Unsupported file type: ${mimeType || filename || 'unknown'}. ` +
          `Supported: PDF, Markdown, Word (.docx), PowerPoint (.pptx).`,
      );
    }

    if (filename.length > MAX_FILENAME_LENGTH) {
      throw new Error(`Filename too long (max ${MAX_FILENAME_LENGTH} characters)`);
    }
  }
}
