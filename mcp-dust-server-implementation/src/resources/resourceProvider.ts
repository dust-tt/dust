// src/resources/resourceProvider.ts
import { logger } from '../utils/logger';
import { DustService } from '../services/dustService';
import { PermissionProxy } from '../services/permissionProxy';
import { ResourceHierarchy, ResourceContent } from './resourceHierarchy';
import { MCPServer } from '../types/server';
import { APIError } from '../middleware/error-middleware';

/**
 * Resource provider options
 */
export interface ResourceProviderOptions {
  dustService: DustService;
  permissionProxy: PermissionProxy;
  mcpServer: MCPServer;
}

/**
 * Resource provider for MCP resources
 */
export class ResourceProvider {
  private dustService: DustService;
  private permissionProxy: PermissionProxy;
  private mcpServer: MCPServer;
  private resourceHierarchy: ResourceHierarchy;
  
  /**
   * Create a new ResourceProvider
   * @param options Resource provider options
   */
  constructor(options: ResourceProviderOptions) {
    this.dustService = options.dustService;
    this.permissionProxy = options.permissionProxy;
    this.mcpServer = options.mcpServer;
    this.resourceHierarchy = new ResourceHierarchy({
      dustService: this.dustService,
      permissionProxy: this.permissionProxy,
    });
    
    logger.info('ResourceProvider initialized');
  }
  
  /**
   * Register resource templates with the MCP server
   */
  public registerResourceTemplates(): void {
    logger.info('Registering resource templates');
    
    // Register root resource template
    this.mcpServer.addResourceTemplate({
      uriTemplate: 'dust://',
      name: 'Dust API Root',
      description: 'Root of the Dust API',
      mimeType: 'application/json',
      async load(_, { session }) {
        try {
          const resourceProvider = session.data.resourceProvider as ResourceProvider;
          const apiKey = session.user?.apiKey;
          
          if (!apiKey) {
            throw new APIError('API key is required', 401, 'UNAUTHORIZED');
          }
          
          const resource = await resourceProvider.getResource('dust://', apiKey);
          
          return { text: JSON.stringify(resource) };
        } catch (error) {
          logger.error(`Error loading root resource: ${error.message}`);
          throw error;
        }
      },
    });
    
    // Register workspaces resource template
    this.mcpServer.addResourceTemplate({
      uriTemplate: 'dust://workspaces',
      name: 'Workspaces',
      description: 'List of workspaces',
      mimeType: 'application/json',
      async load(_, { session }) {
        try {
          const resourceProvider = session.data.resourceProvider as ResourceProvider;
          const apiKey = session.user?.apiKey;
          
          if (!apiKey) {
            throw new APIError('API key is required', 401, 'UNAUTHORIZED');
          }
          
          const resource = await resourceProvider.getResource('dust://workspaces', apiKey);
          
          return { text: JSON.stringify(resource) };
        } catch (error) {
          logger.error(`Error loading workspaces resource: ${error.message}`);
          throw error;
        }
      },
    });
    
    // Register workspace resource template
    this.mcpServer.addResourceTemplate({
      uriTemplate: 'dust://workspaces/{workspaceId}',
      name: 'Workspace',
      description: 'Workspace details',
      mimeType: 'application/json',
      arguments: [
        {
          name: 'workspaceId',
          description: 'ID of the workspace',
          required: true,
        },
      ],
      async load({ workspaceId }, { session }) {
        try {
          const resourceProvider = session.data.resourceProvider as ResourceProvider;
          const apiKey = session.user?.apiKey;
          
          if (!apiKey) {
            throw new APIError('API key is required', 401, 'UNAUTHORIZED');
          }
          
          const resource = await resourceProvider.getResource(`dust://workspaces/${workspaceId}`, apiKey);
          
          return { text: JSON.stringify(resource) };
        } catch (error) {
          logger.error(`Error loading workspace resource: ${error.message}`);
          throw error;
        }
      },
    });
    
    // Register agents resource template
    this.mcpServer.addResourceTemplate({
      uriTemplate: 'dust://workspaces/{workspaceId}/agents',
      name: 'Agents',
      description: 'List of agents in a workspace',
      mimeType: 'application/json',
      arguments: [
        {
          name: 'workspaceId',
          description: 'ID of the workspace',
          required: true,
        },
      ],
      async load({ workspaceId }, { session }) {
        try {
          const resourceProvider = session.data.resourceProvider as ResourceProvider;
          const apiKey = session.user?.apiKey;
          
          if (!apiKey) {
            throw new APIError('API key is required', 401, 'UNAUTHORIZED');
          }
          
          const resource = await resourceProvider.getResource(`dust://workspaces/${workspaceId}/agents`, apiKey);
          
          return { text: JSON.stringify(resource) };
        } catch (error) {
          logger.error(`Error loading agents resource: ${error.message}`);
          throw error;
        }
      },
    });
    
    // Register agent resource template
    this.mcpServer.addResourceTemplate({
      uriTemplate: 'dust://workspaces/{workspaceId}/agents/{agentId}',
      name: 'Agent',
      description: 'Agent details',
      mimeType: 'application/json',
      arguments: [
        {
          name: 'workspaceId',
          description: 'ID of the workspace',
          required: true,
        },
        {
          name: 'agentId',
          description: 'ID of the agent',
          required: true,
        },
      ],
      async load({ workspaceId, agentId }, { session }) {
        try {
          const resourceProvider = session.data.resourceProvider as ResourceProvider;
          const apiKey = session.user?.apiKey;
          
          if (!apiKey) {
            throw new APIError('API key is required', 401, 'UNAUTHORIZED');
          }
          
          const resource = await resourceProvider.getResource(`dust://workspaces/${workspaceId}/agents/${agentId}`, apiKey);
          
          return { text: JSON.stringify(resource) };
        } catch (error) {
          logger.error(`Error loading agent resource: ${error.message}`);
          throw error;
        }
      },
    });
    
    // Register knowledge bases resource template
    this.mcpServer.addResourceTemplate({
      uriTemplate: 'dust://workspaces/{workspaceId}/knowledge-bases',
      name: 'Knowledge Bases',
      description: 'List of knowledge bases in a workspace',
      mimeType: 'application/json',
      arguments: [
        {
          name: 'workspaceId',
          description: 'ID of the workspace',
          required: true,
        },
      ],
      async load({ workspaceId }, { session }) {
        try {
          const resourceProvider = session.data.resourceProvider as ResourceProvider;
          const apiKey = session.user?.apiKey;
          
          if (!apiKey) {
            throw new APIError('API key is required', 401, 'UNAUTHORIZED');
          }
          
          const resource = await resourceProvider.getResource(`dust://workspaces/${workspaceId}/knowledge-bases`, apiKey);
          
          return { text: JSON.stringify(resource) };
        } catch (error) {
          logger.error(`Error loading knowledge bases resource: ${error.message}`);
          throw error;
        }
      },
    });
    
    // Register knowledge base resource template
    this.mcpServer.addResourceTemplate({
      uriTemplate: 'dust://workspaces/{workspaceId}/knowledge-bases/{knowledgeBaseId}',
      name: 'Knowledge Base',
      description: 'Knowledge base details',
      mimeType: 'application/json',
      arguments: [
        {
          name: 'workspaceId',
          description: 'ID of the workspace',
          required: true,
        },
        {
          name: 'knowledgeBaseId',
          description: 'ID of the knowledge base',
          required: true,
        },
      ],
      async load({ workspaceId, knowledgeBaseId }, { session }) {
        try {
          const resourceProvider = session.data.resourceProvider as ResourceProvider;
          const apiKey = session.user?.apiKey;
          
          if (!apiKey) {
            throw new APIError('API key is required', 401, 'UNAUTHORIZED');
          }
          
          const resource = await resourceProvider.getResource(`dust://workspaces/${workspaceId}/knowledge-bases/${knowledgeBaseId}`, apiKey);
          
          return { text: JSON.stringify(resource) };
        } catch (error) {
          logger.error(`Error loading knowledge base resource: ${error.message}`);
          throw error;
        }
      },
    });
    
    // Register connectors resource template
    this.mcpServer.addResourceTemplate({
      uriTemplate: 'dust://workspaces/{workspaceId}/connectors',
      name: 'Connectors',
      description: 'List of connectors in a workspace',
      mimeType: 'application/json',
      arguments: [
        {
          name: 'workspaceId',
          description: 'ID of the workspace',
          required: true,
        },
      ],
      async load({ workspaceId }, { session }) {
        try {
          const resourceProvider = session.data.resourceProvider as ResourceProvider;
          const apiKey = session.user?.apiKey;
          
          if (!apiKey) {
            throw new APIError('API key is required', 401, 'UNAUTHORIZED');
          }
          
          const resource = await resourceProvider.getResource(`dust://workspaces/${workspaceId}/connectors`, apiKey);
          
          return { text: JSON.stringify(resource) };
        } catch (error) {
          logger.error(`Error loading connectors resource: ${error.message}`);
          throw error;
        }
      },
    });
    
    // Register connector resource template
    this.mcpServer.addResourceTemplate({
      uriTemplate: 'dust://workspaces/{workspaceId}/connectors/{connectorId}',
      name: 'Connector',
      description: 'Connector details',
      mimeType: 'application/json',
      arguments: [
        {
          name: 'workspaceId',
          description: 'ID of the workspace',
          required: true,
        },
        {
          name: 'connectorId',
          description: 'ID of the connector',
          required: true,
        },
      ],
      async load({ workspaceId, connectorId }, { session }) {
        try {
          const resourceProvider = session.data.resourceProvider as ResourceProvider;
          const apiKey = session.user?.apiKey;
          
          if (!apiKey) {
            throw new APIError('API key is required', 401, 'UNAUTHORIZED');
          }
          
          const resource = await resourceProvider.getResource(`dust://workspaces/${workspaceId}/connectors/${connectorId}`, apiKey);
          
          return { text: JSON.stringify(resource) };
        } catch (error) {
          logger.error(`Error loading connector resource: ${error.message}`);
          throw error;
        }
      },
    });
    
    // Register tasks resource template
    this.mcpServer.addResourceTemplate({
      uriTemplate: 'dust://workspaces/{workspaceId}/tasks',
      name: 'Tasks',
      description: 'List of tasks in a workspace',
      mimeType: 'application/json',
      arguments: [
        {
          name: 'workspaceId',
          description: 'ID of the workspace',
          required: true,
        },
      ],
      async load({ workspaceId }, { session }) {
        try {
          const resourceProvider = session.data.resourceProvider as ResourceProvider;
          const apiKey = session.user?.apiKey;
          
          if (!apiKey) {
            throw new APIError('API key is required', 401, 'UNAUTHORIZED');
          }
          
          const resource = await resourceProvider.getResource(`dust://workspaces/${workspaceId}/tasks`, apiKey);
          
          return { text: JSON.stringify(resource) };
        } catch (error) {
          logger.error(`Error loading tasks resource: ${error.message}`);
          throw error;
        }
      },
    });
    
    // Register task resource template
    this.mcpServer.addResourceTemplate({
      uriTemplate: 'dust://workspaces/{workspaceId}/tasks/{taskId}',
      name: 'Task',
      description: 'Task details',
      mimeType: 'application/json',
      arguments: [
        {
          name: 'workspaceId',
          description: 'ID of the workspace',
          required: true,
        },
        {
          name: 'taskId',
          description: 'ID of the task',
          required: true,
        },
      ],
      async load({ workspaceId, taskId }, { session }) {
        try {
          const resourceProvider = session.data.resourceProvider as ResourceProvider;
          const apiKey = session.user?.apiKey;
          
          if (!apiKey) {
            throw new APIError('API key is required', 401, 'UNAUTHORIZED');
          }
          
          const resource = await resourceProvider.getResource(`dust://workspaces/${workspaceId}/tasks/${taskId}`, apiKey);
          
          return { text: JSON.stringify(resource) };
        } catch (error) {
          logger.error(`Error loading task resource: ${error.message}`);
          throw error;
        }
      },
    });
    
    logger.info('Resource templates registered');
  }
  
  /**
   * Get a resource by URI
   * @param uri Resource URI
   * @param apiKey API key
   * @returns Resource content
   */
  public async getResource(uri: string, apiKey: string): Promise<ResourceContent> {
    return this.resourceHierarchy.getResource(uri, apiKey);
  }
  
  /**
   * Clear the resource cache
   */
  public clearCache(): void {
    this.resourceHierarchy.clearCache();
  }
}
