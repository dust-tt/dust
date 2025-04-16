// src/tools/knowledgeBaseTools.ts
import { z } from 'zod';
import { logger } from '../utils/logger';
import { KnowledgeBaseService } from '../services/knowledgeBaseService';
import { MCPServer } from '../types/server';
import { APIError } from '../middleware/error-middleware';

/**
 * Knowledge base tools options
 */
export interface KnowledgeBaseToolsOptions {
  knowledgeBaseService: KnowledgeBaseService;
  mcpServer: MCPServer;
}

/**
 * Register knowledge base tools with the MCP server
 * @param options Knowledge base tools options
 */
export function registerKnowledgeBaseTools(options: KnowledgeBaseToolsOptions): void {
  const { knowledgeBaseService, mcpServer } = options;
  
  logger.info('Registering knowledge base tools');
  
  // Register search knowledge base tool
  mcpServer.addTool({
    name: 'dust/knowledge/search',
    description: 'Search a knowledge base',
    parameters: z.object({
      workspaceId: z.string().min(1),
      knowledgeBaseId: z.string().min(1),
      query: z.string().min(1),
      limit: z.number().int().positive().optional().default(10),
    }),
    async execute(args, { session }) {
      try {
        const apiKey = session.user?.apiKey;
        
        if (!apiKey) {
          throw new APIError('API key is required', 401, 'UNAUTHORIZED');
        }
        
        const searchResult = await knowledgeBaseService.searchKnowledgeBase(
          args.workspaceId,
          args.knowledgeBaseId,
          args.query,
          args.limit,
          apiKey
        );
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(searchResult),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error searching knowledge base: ${error.message}`);
        throw error;
      }
    },
  });
  
  // Register get search result tool
  mcpServer.addTool({
    name: 'dust/knowledge/search/get',
    description: 'Get search result by ID',
    parameters: z.object({
      workspaceId: z.string().min(1),
      knowledgeBaseId: z.string().min(1),
      searchId: z.string().min(1),
    }),
    async execute(args, { session }) {
      try {
        const apiKey = session.user?.apiKey;
        
        if (!apiKey) {
          throw new APIError('API key is required', 401, 'UNAUTHORIZED');
        }
        
        const searchResult = await knowledgeBaseService.getSearchResult(
          args.workspaceId,
          args.knowledgeBaseId,
          args.searchId,
          apiKey
        );
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(searchResult),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error getting search result: ${error.message}`);
        throw error;
      }
    },
  });
  
  // Register list search results tool
  mcpServer.addTool({
    name: 'dust/knowledge/search/list',
    description: 'List search results for a knowledge base',
    parameters: z.object({
      workspaceId: z.string().min(1),
      knowledgeBaseId: z.string().min(1),
    }),
    async execute(args, { session }) {
      try {
        const apiKey = session.user?.apiKey;
        
        if (!apiKey) {
          throw new APIError('API key is required', 401, 'UNAUTHORIZED');
        }
        
        const searchResults = await knowledgeBaseService.listSearchResults(
          args.workspaceId,
          args.knowledgeBaseId,
          apiKey
        );
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ searchResults }),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error listing search results: ${error.message}`);
        throw error;
      }
    },
  });
  
  // Register add document tool
  mcpServer.addTool({
    name: 'dust/knowledge/document/add',
    description: 'Add a document to a knowledge base',
    parameters: z.object({
      workspaceId: z.string().min(1),
      knowledgeBaseId: z.string().min(1),
      title: z.string().min(1).max(100),
      content: z.string().min(1),
      tags: z.array(z.string()).optional(),
      metadata: z.record(z.any()).optional(),
    }),
    async execute(args, { session }) {
      try {
        const apiKey = session.user?.apiKey;
        
        if (!apiKey) {
          throw new APIError('API key is required', 401, 'UNAUTHORIZED');
        }
        
        const document = await knowledgeBaseService.addDocument(
          args.workspaceId,
          args.knowledgeBaseId,
          args.title,
          args.content,
          args.tags,
          args.metadata,
          apiKey
        );
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(document),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error adding document: ${error.message}`);
        throw error;
      }
    },
  });
  
  // Register get document tool
  mcpServer.addTool({
    name: 'dust/knowledge/document/get',
    description: 'Get document by ID',
    parameters: z.object({
      workspaceId: z.string().min(1),
      knowledgeBaseId: z.string().min(1),
      documentId: z.string().min(1),
    }),
    async execute(args, { session }) {
      try {
        const apiKey = session.user?.apiKey;
        
        if (!apiKey) {
          throw new APIError('API key is required', 401, 'UNAUTHORIZED');
        }
        
        const document = await knowledgeBaseService.getDocument(
          args.workspaceId,
          args.knowledgeBaseId,
          args.documentId,
          apiKey
        );
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(document),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error getting document: ${error.message}`);
        throw error;
      }
    },
  });
  
  // Register list documents tool
  mcpServer.addTool({
    name: 'dust/knowledge/document/list',
    description: 'List documents in a knowledge base',
    parameters: z.object({
      workspaceId: z.string().min(1),
      knowledgeBaseId: z.string().min(1),
    }),
    async execute(args, { session }) {
      try {
        const apiKey = session.user?.apiKey;
        
        if (!apiKey) {
          throw new APIError('API key is required', 401, 'UNAUTHORIZED');
        }
        
        const documents = await knowledgeBaseService.listDocuments(
          args.workspaceId,
          args.knowledgeBaseId,
          apiKey
        );
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ documents }),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error listing documents: ${error.message}`);
        throw error;
      }
    },
  });
  
  // Register update document tool
  mcpServer.addTool({
    name: 'dust/knowledge/document/update',
    description: 'Update a document',
    parameters: z.object({
      workspaceId: z.string().min(1),
      knowledgeBaseId: z.string().min(1),
      documentId: z.string().min(1),
      title: z.string().min(1).max(100).optional(),
      content: z.string().min(1).optional(),
      tags: z.array(z.string()).optional(),
      metadata: z.record(z.any()).optional(),
    }),
    async execute(args, { session }) {
      try {
        const apiKey = session.user?.apiKey;
        
        if (!apiKey) {
          throw new APIError('API key is required', 401, 'UNAUTHORIZED');
        }
        
        const document = await knowledgeBaseService.updateDocument(
          args.workspaceId,
          args.knowledgeBaseId,
          args.documentId,
          args.title,
          args.content,
          args.tags,
          args.metadata,
          apiKey
        );
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(document),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error updating document: ${error.message}`);
        throw error;
      }
    },
  });
  
  // Register delete document tool
  mcpServer.addTool({
    name: 'dust/knowledge/document/delete',
    description: 'Delete a document',
    parameters: z.object({
      workspaceId: z.string().min(1),
      knowledgeBaseId: z.string().min(1),
      documentId: z.string().min(1),
    }),
    async execute(args, { session }) {
      try {
        const apiKey = session.user?.apiKey;
        
        if (!apiKey) {
          throw new APIError('API key is required', 401, 'UNAUTHORIZED');
        }
        
        await knowledgeBaseService.deleteDocument(
          args.workspaceId,
          args.knowledgeBaseId,
          args.documentId,
          apiKey
        );
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true }),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error deleting document: ${error.message}`);
        throw error;
      }
    },
  });
  
  logger.info('Knowledge base tools registered');
}
