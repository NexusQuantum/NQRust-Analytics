import { IContext } from '@server/types';
import { getLogger } from '@server/utils';

const logger = getLogger('NotebookResolver');
logger.level = 'debug';

export class NotebookResolver {
  constructor() {
    this.listNotebooks = this.listNotebooks.bind(this);
    this.getNotebook = this.getNotebook.bind(this);
    this.createNotebook = this.createNotebook.bind(this);
    this.renameNotebook = this.renameNotebook.bind(this);
    this.deleteNotebook = this.deleteNotebook.bind(this);
    this.listDocuments = this.listDocuments.bind(this);
    this.deleteDocument = this.deleteDocument.bind(this);
    this.toggleDocumentSelection = this.toggleDocumentSelection.bind(this);
  }

  private requireAuth(ctx: IContext): number {
    if (!ctx.user) throw new Error('Authentication required');
    return ctx.user.id;
  }

  // ----------------- Queries -----------------

  public async listNotebooks(
    _root: any,
    args: { projectId: string },
    ctx: IContext,
  ) {
    return ctx.notebookService.list(parseInt(args.projectId, 10));
  }

  public async getNotebook(
    _root: any,
    args: { id: string },
    ctx: IContext,
  ) {
    const notebook = await ctx.notebookService.getById(parseInt(args.id, 10));
    if (!notebook) throw new Error('Notebook not found');
    return notebook;
  }

  public async listDocuments(
    _root: any,
    args: { notebookId: string },
    ctx: IContext,
  ) {
    const userId = this.requireAuth(ctx);
    const notebookId = parseInt(args.notebookId, 10);
    let docs = await ctx.documentService.listByNotebook(notebookId);

    // Reconcile in-flight statuses with the AI service. Background indexing
    // there has no callback hook back to the UI DB, so we lazily refresh on
    // each list call. We only check docs still parsing/embedding to keep
    // this cheap; ready/failed are terminal.
    const aiEndpoint =
      process.env.ANALYTICS_AI_ENDPOINT || 'http://localhost:5555';
    const inFlight = docs.filter((d) =>
      ['uploading', 'parsing', 'embedding'].includes(d.status),
    );
    if (inFlight.length > 0) {
      await Promise.all(
        inFlight.map(async (d) => {
          try {
            const res = await fetch(
              `${aiEndpoint}/v1/documents/${d.id}/status`,
            );
            if (!res.ok) return;
            const live = (await res.json()) as {
              status?: string;
              chunks_indexed?: number;
              error?: { code: string; message: string };
            };
            if (live.status === 'ready' && d.status !== 'ready') {
              await ctx.documentService.updateStatus(d.id, 'ready', {
                qdrantIndexedAt: new Date(),
              });
              d.status = 'ready';
              d.qdrantIndexedAt = new Date();
            } else if (live.status === 'failed' && d.status !== 'failed') {
              await ctx.documentService.updateStatus(d.id, 'failed', {
                errorMessage: live.error?.message || 'Indexing failed',
              });
              d.status = 'failed';
              d.errorMessage = live.error?.message || 'Indexing failed';
            } else if (
              live.status === 'embedding' &&
              d.status === 'parsing'
            ) {
              await ctx.documentService.updateStatus(d.id, 'embedding');
              d.status = 'embedding';
            }
          } catch (e: any) {
            logger.warn(`Status reconcile failed for doc ${d.id}: ${e?.message || e}`);
          }
        }),
      );
    }

    const selectionMap = await ctx.documentService.getSelectionMap(
      notebookId,
      userId,
    );
    return docs.map((d) => ({
      ...d,
      selected: !!selectionMap[d.id],
    }));
  }

  // ----------------- Mutations -----------------

  public async createNotebook(
    _root: any,
    args: { input: { projectId: string; name: string } },
    ctx: IContext,
  ) {
    const userId = ctx.user?.id ?? null;
    return ctx.notebookService.create(
      {
        projectId: parseInt(args.input.projectId, 10),
        name: args.input.name,
      },
      userId,
    );
  }

  public async renameNotebook(
    _root: any,
    args: { id: string; name: string },
    ctx: IContext,
  ) {
    return ctx.notebookService.rename(parseInt(args.id, 10), args.name);
  }

  public async deleteNotebook(
    _root: any,
    args: { id: string },
    ctx: IContext,
  ) {
    await ctx.notebookService.delete(parseInt(args.id, 10));
    return true;
  }

  public async deleteDocument(
    _root: any,
    args: { id: string },
    ctx: IContext,
  ) {
    const id = parseInt(args.id, 10);
    const doc = await ctx.documentService.delete(id);
    if (!doc) return false;

    // Best-effort: remove chunks from Qdrant. Wired in Phase 8.
    const adaptor = ctx.analyticsAIAdaptor as unknown as {
      deleteIndexedDocument?: (id: string) => Promise<void>;
    };
    if (typeof adaptor.deleteIndexedDocument === 'function') {
      try {
        await adaptor.deleteIndexedDocument(String(id));
      } catch (e) {
        logger.warn(`AI service delete failed for document ${id}: ${e}`);
      }
    }
    return true;
  }

  public async toggleDocumentSelection(
    _root: any,
    args: { documentId: string; selected: boolean },
    ctx: IContext,
  ) {
    const userId = this.requireAuth(ctx);
    const docId = parseInt(args.documentId, 10);
    const doc = await ctx.documentService.getById(docId);
    if (!doc) throw new Error('Document not found');
    await ctx.documentService.setSelection(
      doc.notebookId,
      docId,
      userId,
      args.selected,
    );
    return { ...doc, selected: args.selected };
  }
}
