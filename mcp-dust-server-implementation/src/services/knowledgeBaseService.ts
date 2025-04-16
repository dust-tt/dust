// src/services/knowledgeBaseService.ts
import { logger } from '../utils/logger';
import { DustService, DustKnowledgeBase } from './dustService';
import { PermissionProxy, Permission, ResourceType } from './permissionProxy';
import { EventBridge, EventType } from './eventBridge';
import { APIError } from '../middleware/error-middleware';

/**
 * Knowledge base document
 */
export interface KnowledgeBaseDocument {
  id: string;
  knowledgeBaseId: string;
  workspaceId: string;
  title: string;
  content: string;
  tags?: string[];
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Knowledge base search result
 */
export interface KnowledgeBaseSearchResult {
  id: string;
  knowledgeBaseId: string;
  workspaceId: string;
  query: string;
  results: {
    documentId: string;
    title: string;
    content: string;
    score: number;
    metadata?: Record<string, any>;
  }[];
  createdAt: string;
}

/**
 * Knowledge base service options
 */
export interface KnowledgeBaseServiceOptions {
  dustService: DustService;
  permissionProxy: PermissionProxy;
  eventBridge?: EventBridge;
}

/**
 * Knowledge base service for managing knowledge bases
 */
export class KnowledgeBaseService {
  private dustService: DustService;
  private permissionProxy: PermissionProxy;
  private eventBridge?: EventBridge;
  private documents: Map<string, KnowledgeBaseDocument>;
  private searchResults: Map<string, KnowledgeBaseSearchResult>;
  
  /**
   * Create a new KnowledgeBaseService
   * @param options Knowledge base service options
   */
  constructor(options: KnowledgeBaseServiceOptions) {
    this.dustService = options.dustService;
    this.permissionProxy = options.permissionProxy;
    this.eventBridge = options.eventBridge;
    this.documents = new Map();
    this.searchResults = new Map();
    
    logger.info('KnowledgeBaseService initialized');
  }
  
  /**
   * List knowledge bases in a workspace
   * @param workspaceId Workspace ID
   * @param apiKey API key
   * @returns List of knowledge bases
   */
  public async listKnowledgeBases(workspaceId: string, apiKey: string): Promise<DustKnowledgeBase[]> {
    try {
      // Check if user has permission to access this workspace
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.READ_WORKSPACE,
        ResourceType.WORKSPACE,
        workspaceId
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to access this workspace: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Get knowledge bases from Dust API
      return this.dustService.listKnowledgeBases(workspaceId);
    } catch (error) {
      logger.error(`Error listing knowledge bases for workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get knowledge base by ID
   * @param workspaceId Workspace ID
   * @param knowledgeBaseId Knowledge base ID
   * @param apiKey API key
   * @returns Knowledge base details
   */
  public async getKnowledgeBase(
    workspaceId: string,
    knowledgeBaseId: string,
    apiKey: string
  ): Promise<DustKnowledgeBase> {
    try {
      // Check if user has permission to access this knowledge base
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.READ_KNOWLEDGE,
        ResourceType.KNOWLEDGE_BASE,
        `${workspaceId}/${knowledgeBaseId}`
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to access this knowledge base: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Get knowledge base from Dust API
      return this.dustService.getKnowledgeBase(workspaceId, knowledgeBaseId);
    } catch (error) {
      logger.error(`Error getting knowledge base ${knowledgeBaseId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Search a knowledge base
   * @param workspaceId Workspace ID
   * @param knowledgeBaseId Knowledge base ID
   * @param query Search query
   * @param limit Result limit
   * @param apiKey API key
   * @returns Search result
   */
  public async searchKnowledgeBase(
    workspaceId: string,
    knowledgeBaseId: string,
    query: string,
    limit: number,
    apiKey: string
  ): Promise<KnowledgeBaseSearchResult> {
    try {
      // Check if user has permission to access this knowledge base
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.READ_KNOWLEDGE,
        ResourceType.KNOWLEDGE_BASE,
        `${workspaceId}/${knowledgeBaseId}`
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to access this knowledge base: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Emit search started event
      if (this.eventBridge) {
        this.eventBridge.emit(EventType.KNOWLEDGE_BASE_SEARCH_STARTED, {
          workspaceId,
          knowledgeBaseId,
          query,
          limit,
        });
      }
      
      // Search knowledge base using Dust API
      const searchResults = await this.dustService.searchKnowledgeBase(
        workspaceId,
        knowledgeBaseId,
        query,
        limit
      );
      
      // Create search result
      const searchId = `search-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const searchResult: KnowledgeBaseSearchResult = {
        id: searchId,
        knowledgeBaseId,
        workspaceId,
        query,
        results: searchResults.map(result => ({
          documentId: result.id,
          title: result.title,
          content: result.content,
          score: result.score,
          metadata: result.metadata,
        })),
        createdAt: new Date().toISOString(),
      };
      
      // Store search result
      this.searchResults.set(searchId, searchResult);
      
      // Emit search completed event
      if (this.eventBridge) {
        this.eventBridge.emit(EventType.KNOWLEDGE_BASE_SEARCH_COMPLETED, {
          workspaceId,
          knowledgeBaseId,
          searchId,
          query,
          results: searchResult.results,
        });
      }
      
      return searchResult;
    } catch (error) {
      // Emit search failed event
      if (this.eventBridge) {
        this.eventBridge.emit(EventType.KNOWLEDGE_BASE_SEARCH_FAILED, {
          workspaceId,
          knowledgeBaseId,
          query,
          error: error.message,
        });
      }
      
      logger.error(`Error searching knowledge base ${knowledgeBaseId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get search result by ID
   * @param workspaceId Workspace ID
   * @param knowledgeBaseId Knowledge base ID
   * @param searchId Search ID
   * @param apiKey API key
   * @returns Search result
   */
  public async getSearchResult(
    workspaceId: string,
    knowledgeBaseId: string,
    searchId: string,
    apiKey: string
  ): Promise<KnowledgeBaseSearchResult> {
    try {
      // Check if user has permission to access this knowledge base
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.READ_KNOWLEDGE,
        ResourceType.KNOWLEDGE_BASE,
        `${workspaceId}/${knowledgeBaseId}`
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to access this knowledge base: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Get search result
      const searchResult = this.searchResults.get(searchId);
      
      if (!searchResult) {
        throw new APIError(`Search result not found: ${searchId}`, 404, 'NOT_FOUND');
      }
      
      // Check if search result belongs to the specified knowledge base and workspace
      if (searchResult.knowledgeBaseId !== knowledgeBaseId || searchResult.workspaceId !== workspaceId) {
        throw new APIError(
          `Search result does not belong to the specified knowledge base or workspace`,
          400,
          'BAD_REQUEST'
        );
      }
      
      return searchResult;
    } catch (error) {
      logger.error(`Error getting search result ${searchId} for knowledge base ${knowledgeBaseId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * List search results for a knowledge base
   * @param workspaceId Workspace ID
   * @param knowledgeBaseId Knowledge base ID
   * @param apiKey API key
   * @returns List of search results
   */
  public async listSearchResults(
    workspaceId: string,
    knowledgeBaseId: string,
    apiKey: string
  ): Promise<KnowledgeBaseSearchResult[]> {
    try {
      // Check if user has permission to access this knowledge base
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.READ_KNOWLEDGE,
        ResourceType.KNOWLEDGE_BASE,
        `${workspaceId}/${knowledgeBaseId}`
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to access this knowledge base: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Get search results
      const searchResults = Array.from(this.searchResults.values())
        .filter(result => result.knowledgeBaseId === knowledgeBaseId && result.workspaceId === workspaceId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      return searchResults;
    } catch (error) {
      logger.error(`Error listing search results for knowledge base ${knowledgeBaseId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Add a document to a knowledge base
   * @param workspaceId Workspace ID
   * @param knowledgeBaseId Knowledge base ID
   * @param title Document title
   * @param content Document content
   * @param tags Document tags
   * @param metadata Document metadata
   * @param apiKey API key
   * @returns Added document
   */
  public async addDocument(
    workspaceId: string,
    knowledgeBaseId: string,
    title: string,
    content: string,
    tags: string[] | undefined,
    metadata: Record<string, any> | undefined,
    apiKey: string
  ): Promise<KnowledgeBaseDocument> {
    try {
      // Check if user has permission to update this knowledge base
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.WRITE_KNOWLEDGE,
        ResourceType.KNOWLEDGE_BASE,
        `${workspaceId}/${knowledgeBaseId}`
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to update this knowledge base: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Check if knowledge base exists
      await this.getKnowledgeBase(workspaceId, knowledgeBaseId, apiKey);
      
      // Create document
      const documentId = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const document: KnowledgeBaseDocument = {
        id: documentId,
        knowledgeBaseId,
        workspaceId,
        title,
        content,
        tags,
        metadata,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      // Store document
      this.documents.set(documentId, document);
      
      return document;
    } catch (error) {
      logger.error(`Error adding document to knowledge base ${knowledgeBaseId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get document by ID
   * @param workspaceId Workspace ID
   * @param knowledgeBaseId Knowledge base ID
   * @param documentId Document ID
   * @param apiKey API key
   * @returns Document
   */
  public async getDocument(
    workspaceId: string,
    knowledgeBaseId: string,
    documentId: string,
    apiKey: string
  ): Promise<KnowledgeBaseDocument> {
    try {
      // Check if user has permission to access this knowledge base
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.READ_KNOWLEDGE,
        ResourceType.KNOWLEDGE_BASE,
        `${workspaceId}/${knowledgeBaseId}`
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to access this knowledge base: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Get document
      const document = this.documents.get(documentId);
      
      if (!document) {
        throw new APIError(`Document not found: ${documentId}`, 404, 'NOT_FOUND');
      }
      
      // Check if document belongs to the specified knowledge base and workspace
      if (document.knowledgeBaseId !== knowledgeBaseId || document.workspaceId !== workspaceId) {
        throw new APIError(
          `Document does not belong to the specified knowledge base or workspace`,
          400,
          'BAD_REQUEST'
        );
      }
      
      return document;
    } catch (error) {
      logger.error(`Error getting document ${documentId} from knowledge base ${knowledgeBaseId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * List documents in a knowledge base
   * @param workspaceId Workspace ID
   * @param knowledgeBaseId Knowledge base ID
   * @param apiKey API key
   * @returns List of documents
   */
  public async listDocuments(
    workspaceId: string,
    knowledgeBaseId: string,
    apiKey: string
  ): Promise<KnowledgeBaseDocument[]> {
    try {
      // Check if user has permission to access this knowledge base
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.READ_KNOWLEDGE,
        ResourceType.KNOWLEDGE_BASE,
        `${workspaceId}/${knowledgeBaseId}`
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to access this knowledge base: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Get documents
      const documents = Array.from(this.documents.values())
        .filter(document => document.knowledgeBaseId === knowledgeBaseId && document.workspaceId === workspaceId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      return documents;
    } catch (error) {
      logger.error(`Error listing documents for knowledge base ${knowledgeBaseId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Update a document
   * @param workspaceId Workspace ID
   * @param knowledgeBaseId Knowledge base ID
   * @param documentId Document ID
   * @param title Document title
   * @param content Document content
   * @param tags Document tags
   * @param metadata Document metadata
   * @param apiKey API key
   * @returns Updated document
   */
  public async updateDocument(
    workspaceId: string,
    knowledgeBaseId: string,
    documentId: string,
    title: string | undefined,
    content: string | undefined,
    tags: string[] | undefined,
    metadata: Record<string, any> | undefined,
    apiKey: string
  ): Promise<KnowledgeBaseDocument> {
    try {
      // Check if user has permission to update this knowledge base
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.WRITE_KNOWLEDGE,
        ResourceType.KNOWLEDGE_BASE,
        `${workspaceId}/${knowledgeBaseId}`
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to update this knowledge base: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Get document
      const document = await this.getDocument(workspaceId, knowledgeBaseId, documentId, apiKey);
      
      // Update document
      if (title !== undefined) {
        document.title = title;
      }
      
      if (content !== undefined) {
        document.content = content;
      }
      
      if (tags !== undefined) {
        document.tags = tags;
      }
      
      if (metadata !== undefined) {
        document.metadata = metadata;
      }
      
      document.updatedAt = new Date().toISOString();
      
      // Store updated document
      this.documents.set(documentId, document);
      
      return document;
    } catch (error) {
      logger.error(`Error updating document ${documentId} in knowledge base ${knowledgeBaseId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Delete a document
   * @param workspaceId Workspace ID
   * @param knowledgeBaseId Knowledge base ID
   * @param documentId Document ID
   * @param apiKey API key
   */
  public async deleteDocument(
    workspaceId: string,
    knowledgeBaseId: string,
    documentId: string,
    apiKey: string
  ): Promise<void> {
    try {
      // Check if user has permission to update this knowledge base
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.WRITE_KNOWLEDGE,
        ResourceType.KNOWLEDGE_BASE,
        `${workspaceId}/${knowledgeBaseId}`
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to update this knowledge base: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Get document
      await this.getDocument(workspaceId, knowledgeBaseId, documentId, apiKey);
      
      // Delete document
      this.documents.delete(documentId);
    } catch (error) {
      logger.error(`Error deleting document ${documentId} from knowledge base ${knowledgeBaseId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
}
