// src/controllers/knowledgeBaseController.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { KnowledgeBaseService } from '../services/knowledgeBaseService';
import { APIError } from '../middleware/error-middleware';

/**
 * Knowledge base controller for handling knowledge base-related API endpoints
 */
export class KnowledgeBaseController {
  private knowledgeBaseService: KnowledgeBaseService;
  
  /**
   * Create a new KnowledgeBaseController
   * @param knowledgeBaseService Knowledge base service
   */
  constructor(knowledgeBaseService: KnowledgeBaseService) {
    this.knowledgeBaseService = knowledgeBaseService;
    
    logger.info('KnowledgeBaseController initialized');
  }
  
  /**
   * List knowledge bases in a workspace
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public listKnowledgeBases = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID from request parameters
      const { workspaceId } = req.params;
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Get knowledge bases
      const knowledgeBases = await this.knowledgeBaseService.listKnowledgeBases(workspaceId, apiKey);
      
      // Return knowledge bases
      res.json({ knowledgeBases });
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * Get knowledge base by ID
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public getKnowledgeBase = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID and knowledge base ID from request parameters
      const { workspaceId, knowledgeBaseId } = req.params;
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Get knowledge base
      const knowledgeBase = await this.knowledgeBaseService.getKnowledgeBase(
        workspaceId,
        knowledgeBaseId,
        apiKey
      );
      
      // Return knowledge base
      res.json(knowledgeBase);
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * Search a knowledge base
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public searchKnowledgeBase = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID and knowledge base ID from request parameters
      const { workspaceId, knowledgeBaseId } = req.params;
      
      // Get query and limit from request body
      const { query, limit = 10 } = req.body;
      
      // Validate request body
      if (!query) {
        throw new APIError('Query is required', 400, 'BAD_REQUEST');
      }
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Search knowledge base
      const searchResult = await this.knowledgeBaseService.searchKnowledgeBase(
        workspaceId,
        knowledgeBaseId,
        query,
        limit,
        apiKey
      );
      
      // Return search result
      res.json(searchResult);
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * Get search result by ID
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public getSearchResult = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID, knowledge base ID, and search ID from request parameters
      const { workspaceId, knowledgeBaseId, searchId } = req.params;
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Get search result
      const searchResult = await this.knowledgeBaseService.getSearchResult(
        workspaceId,
        knowledgeBaseId,
        searchId,
        apiKey
      );
      
      // Return search result
      res.json(searchResult);
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * List search results for a knowledge base
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public listSearchResults = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID and knowledge base ID from request parameters
      const { workspaceId, knowledgeBaseId } = req.params;
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Get search results
      const searchResults = await this.knowledgeBaseService.listSearchResults(
        workspaceId,
        knowledgeBaseId,
        apiKey
      );
      
      // Return search results
      res.json({ searchResults });
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * Add a document to a knowledge base
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public addDocument = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID and knowledge base ID from request parameters
      const { workspaceId, knowledgeBaseId } = req.params;
      
      // Get document data from request body
      const { title, content, tags, metadata } = req.body;
      
      // Validate request body
      if (!title) {
        throw new APIError('Document title is required', 400, 'BAD_REQUEST');
      }
      
      if (!content) {
        throw new APIError('Document content is required', 400, 'BAD_REQUEST');
      }
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Add document
      const document = await this.knowledgeBaseService.addDocument(
        workspaceId,
        knowledgeBaseId,
        title,
        content,
        tags,
        metadata,
        apiKey
      );
      
      // Return document
      res.status(201).json(document);
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * Get document by ID
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public getDocument = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID, knowledge base ID, and document ID from request parameters
      const { workspaceId, knowledgeBaseId, documentId } = req.params;
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Get document
      const document = await this.knowledgeBaseService.getDocument(
        workspaceId,
        knowledgeBaseId,
        documentId,
        apiKey
      );
      
      // Return document
      res.json(document);
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * List documents in a knowledge base
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public listDocuments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID and knowledge base ID from request parameters
      const { workspaceId, knowledgeBaseId } = req.params;
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Get documents
      const documents = await this.knowledgeBaseService.listDocuments(
        workspaceId,
        knowledgeBaseId,
        apiKey
      );
      
      // Return documents
      res.json({ documents });
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * Update a document
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public updateDocument = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID, knowledge base ID, and document ID from request parameters
      const { workspaceId, knowledgeBaseId, documentId } = req.params;
      
      // Get document data from request body
      const { title, content, tags, metadata } = req.body;
      
      // Validate request body
      if (!title && content === undefined && tags === undefined && metadata === undefined) {
        throw new APIError('At least one field to update is required', 400, 'BAD_REQUEST');
      }
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Update document
      const document = await this.knowledgeBaseService.updateDocument(
        workspaceId,
        knowledgeBaseId,
        documentId,
        title,
        content,
        tags,
        metadata,
        apiKey
      );
      
      // Return document
      res.json(document);
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * Delete a document
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public deleteDocument = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID, knowledge base ID, and document ID from request parameters
      const { workspaceId, knowledgeBaseId, documentId } = req.params;
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Delete document
      await this.knowledgeBaseService.deleteDocument(
        workspaceId,
        knowledgeBaseId,
        documentId,
        apiKey
      );
      
      // Return success
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };
}
