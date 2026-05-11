import { IContext } from '@server/types';
import { getLogger } from '@server/utils';

const logger = getLogger('DocumentResolver');

export class DocumentResolver {
  constructor() {
    this.getDocuments = this.getDocuments.bind(this);
    this.getDocument = this.getDocument.bind(this);
    this.getDocumentSelection = this.getDocumentSelection.bind(this);
    this.deleteDocument = this.deleteDocument.bind(this);
    this.setDocumentSelection = this.setDocumentSelection.bind(this);
  }

  public async getDocuments(_root: any, _args: any, ctx: IContext) {
    try {
      return await ctx.documentService.getAllDocuments();
    } catch (error) {
      logger.error(`Error getting documents: ${error}`);
      throw error;
    }
  }

  public async getDocument(_root: any, args: { id: string }, ctx: IContext) {
    try {
      return await ctx.documentService.getDocument(args.id);
    } catch (error) {
      logger.error(`Error getting document ${args.id}: ${error}`);
      throw error;
    }
  }

  public async getDocumentSelection(_root: any, _args: any, ctx: IContext) {
    try {
      return await ctx.documentService.getSelectedDocumentIds();
    } catch (error) {
      logger.error(`Error getting document selection: ${error}`);
      throw error;
    }
  }

  public async deleteDocument(
    _root: any,
    args: { id: string },
    ctx: IContext,
  ): Promise<boolean> {
    try {
      await ctx.documentService.deleteDocument(args.id);
      return true;
    } catch (error) {
      logger.error(`Error deleting document ${args.id}: ${error}`);
      throw error;
    }
  }

  public async setDocumentSelection(
    _root: any,
    args: { documentIds: string[] },
    ctx: IContext,
  ): Promise<string[]> {
    try {
      await ctx.documentService.setDocumentSelection(args.documentIds);
      return args.documentIds;
    } catch (error) {
      logger.error(`Error setting document selection: ${error}`);
      throw error;
    }
  }
}
