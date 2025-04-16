// src/resources/resourceHierarchy.ts
import { logger } from '../utils/logger';
import { DustService } from '../services/dustService';
import { PermissionProxy, Permission, ResourceType } from '../services/permissionProxy';
import { APIError } from '../middleware/error-middleware';

/**
 * Resource URI structure
 * 
 * dust://                                                  - Root
 * dust://workspaces                                        - Workspaces list
 * dust://workspaces/{workspaceId}                          - Workspace details
 * dust://workspaces/{workspaceId}/agents                   - Agents list
 * dust://workspaces/{workspaceId}/agents/{agentId}         - Agent details
 * dust://workspaces/{workspaceId}/knowledge-bases          - Knowledge bases list
 * dust://workspaces/{workspaceId}/knowledge-bases/{kbId}   - Knowledge base details
 * dust://workspaces/{workspaceId}/connectors               - Connectors list
 * dust://workspaces/{workspaceId}/connectors/{connectorId} - Connector details
 * dust://workspaces/{workspaceId}/tasks                    - Tasks list
 * dust://workspaces/{workspaceId}/tasks/{taskId}           - Task details
 */

/**
 * Resource hierarchy options
 */
export interface ResourceHierarchyOptions {
  dustService: DustService;
  permissionProxy: PermissionProxy;
}

/**
 * Resource metadata
 */
export interface ResourceMetadata {
  id: string;
  name: string;
  description?: string;
  type: string;
  createdAt: string;
  updatedAt: string;
  parentId?: string;
  childrenIds?: string[];
  attributes?: Record<string, any>;
}

/**
 * Resource content
 */
export interface ResourceContent {
  metadata: ResourceMetadata;
  content?: string | Record<string, any>;
  children?: ResourceContent[];
}

/**
 * Resource hierarchy for Dust resources
 */
export class ResourceHierarchy {
  private dustService: DustService;
  private permissionProxy: PermissionProxy;
  private resourceCache: Map<string, ResourceContent>;
  private cacheTTL: number;
  
  /**
   * Create a new ResourceHierarchy
   * @param options Resource hierarchy options
   */
  constructor(options: ResourceHierarchyOptions) {
    this.dustService = options.dustService;
    this.permissionProxy = options.permissionProxy;
    this.resourceCache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
    
    logger.info('ResourceHierarchy initialized');
  }
  
  /**
   * Get a resource by URI
   * @param uri Resource URI
   * @param apiKey API key
   * @returns Resource content
   */
  public async getResource(uri: string, apiKey: string): Promise<ResourceContent> {
    try {
      // Check cache
      const cachedResource = this.resourceCache.get(`${apiKey}:${uri}`);
      if (cachedResource) {
        logger.debug(`Using cached resource for ${uri}`);
        return cachedResource;
      }
      
      // Parse URI
      const parsedUri = this.parseUri(uri);
      
      // Get resource based on URI type
      let resource: ResourceContent;
      
      switch (parsedUri.type) {
        case 'root':
          resource = await this.getRootResource(apiKey);
          break;
        case 'workspaces':
          resource = await this.getWorkspacesResource(apiKey);
          break;
        case 'workspace':
          resource = await this.getWorkspaceResource(parsedUri.workspaceId, apiKey);
          break;
        case 'agents':
          resource = await this.getAgentsResource(parsedUri.workspaceId, apiKey);
          break;
        case 'agent':
          resource = await this.getAgentResource(parsedUri.workspaceId, parsedUri.agentId, apiKey);
          break;
        case 'knowledge-bases':
          resource = await this.getKnowledgeBasesResource(parsedUri.workspaceId, apiKey);
          break;
        case 'knowledge-base':
          resource = await this.getKnowledgeBaseResource(parsedUri.workspaceId, parsedUri.knowledgeBaseId, apiKey);
          break;
        case 'connectors':
          resource = await this.getConnectorsResource(parsedUri.workspaceId, apiKey);
          break;
        case 'connector':
          resource = await this.getConnectorResource(parsedUri.workspaceId, parsedUri.connectorId, apiKey);
          break;
        case 'tasks':
          resource = await this.getTasksResource(parsedUri.workspaceId, apiKey);
          break;
        case 'task':
          resource = await this.getTaskResource(parsedUri.workspaceId, parsedUri.taskId, apiKey);
          break;
        default:
          throw new APIError(`Invalid resource URI: ${uri}`, 400, 'INVALID_URI');
      }
      
      // Cache resource
      this.resourceCache.set(`${apiKey}:${uri}`, resource);
      
      // Add expiration time to cache entry
      setTimeout(() => {
        this.resourceCache.delete(`${apiKey}:${uri}`);
      }, this.cacheTTL);
      
      return resource;
    } catch (error) {
      logger.error(`Error getting resource ${uri}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Parse a resource URI
   * @param uri Resource URI
   * @returns Parsed URI
   */
  private parseUri(uri: string): {
    type: string;
    workspaceId?: string;
    agentId?: string;
    knowledgeBaseId?: string;
    connectorId?: string;
    taskId?: string;
  } {
    // Check if URI starts with dust://
    if (!uri.startsWith('dust://')) {
      throw new APIError(`Invalid resource URI: ${uri}`, 400, 'INVALID_URI');
    }
    
    // Remove dust:// prefix
    const path = uri.substring(7);
    
    // Split path into segments
    const segments = path.split('/').filter(segment => segment.length > 0);
    
    // Parse segments
    if (segments.length === 0) {
      return { type: 'root' };
    } else if (segments.length === 1 && segments[0] === 'workspaces') {
      return { type: 'workspaces' };
    } else if (segments.length === 2 && segments[0] === 'workspaces') {
      return { type: 'workspace', workspaceId: segments[1] };
    } else if (segments.length === 3 && segments[0] === 'workspaces' && segments[2] === 'agents') {
      return { type: 'agents', workspaceId: segments[1] };
    } else if (segments.length === 4 && segments[0] === 'workspaces' && segments[2] === 'agents') {
      return { type: 'agent', workspaceId: segments[1], agentId: segments[3] };
    } else if (segments.length === 3 && segments[0] === 'workspaces' && segments[2] === 'knowledge-bases') {
      return { type: 'knowledge-bases', workspaceId: segments[1] };
    } else if (segments.length === 4 && segments[0] === 'workspaces' && segments[2] === 'knowledge-bases') {
      return { type: 'knowledge-base', workspaceId: segments[1], knowledgeBaseId: segments[3] };
    } else if (segments.length === 3 && segments[0] === 'workspaces' && segments[2] === 'connectors') {
      return { type: 'connectors', workspaceId: segments[1] };
    } else if (segments.length === 4 && segments[0] === 'workspaces' && segments[2] === 'connectors') {
      return { type: 'connector', workspaceId: segments[1], connectorId: segments[3] };
    } else if (segments.length === 3 && segments[0] === 'workspaces' && segments[2] === 'tasks') {
      return { type: 'tasks', workspaceId: segments[1] };
    } else if (segments.length === 4 && segments[0] === 'workspaces' && segments[2] === 'tasks') {
      return { type: 'task', workspaceId: segments[1], taskId: segments[3] };
    } else {
      throw new APIError(`Invalid resource URI: ${uri}`, 400, 'INVALID_URI');
    }
  }
  
  /**
   * Get the root resource
   * @param apiKey API key
   * @returns Root resource
   */
  private async getRootResource(apiKey: string): Promise<ResourceContent> {
    // Create root resource
    const resource: ResourceContent = {
      metadata: {
        id: 'root',
        name: 'Dust',
        description: 'Dust API root',
        type: 'root',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        childrenIds: ['workspaces'],
      },
      children: [],
    };
    
    // Add workspaces child
    resource.children.push({
      metadata: {
        id: 'workspaces',
        name: 'Workspaces',
        description: 'List of workspaces',
        type: 'workspaces',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        parentId: 'root',
      },
    });
    
    return resource;
  }
  
  /**
   * Get the workspaces resource
   * @param apiKey API key
   * @returns Workspaces resource
   */
  private async getWorkspacesResource(apiKey: string): Promise<ResourceContent> {
    try {
      // Get workspaces from Dust API
      const workspaces = await this.dustService.listWorkspaces();
      
      // Create workspaces resource
      const resource: ResourceContent = {
        metadata: {
          id: 'workspaces',
          name: 'Workspaces',
          description: 'List of workspaces',
          type: 'workspaces',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          parentId: 'root',
          childrenIds: workspaces.map(workspace => workspace.id),
        },
        children: [],
      };
      
      // Add workspace children
      for (const workspace of workspaces) {
        // Check if user has permission to access this workspace
        const hasPermission = await this.permissionProxy.checkPermission(
          apiKey,
          Permission.READ_WORKSPACE,
          ResourceType.WORKSPACE,
          workspace.id
        );
        
        if (hasPermission.granted) {
          resource.children.push({
            metadata: {
              id: workspace.id,
              name: workspace.name,
              description: workspace.description,
              type: 'workspace',
              createdAt: workspace.createdAt,
              updatedAt: workspace.updatedAt,
              parentId: 'workspaces',
              childrenIds: ['agents', 'knowledge-bases', 'connectors', 'tasks'].map(type => `${workspace.id}/${type}`),
            },
          });
        }
      }
      
      return resource;
    } catch (error) {
      logger.error(`Error getting workspaces resource: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get a workspace resource
   * @param workspaceId Workspace ID
   * @param apiKey API key
   * @returns Workspace resource
   */
  private async getWorkspaceResource(workspaceId: string, apiKey: string): Promise<ResourceContent> {
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
      
      // Get workspace from Dust API
      const workspace = await this.dustService.getWorkspace(workspaceId);
      
      // Create workspace resource
      const resource: ResourceContent = {
        metadata: {
          id: workspace.id,
          name: workspace.name,
          description: workspace.description,
          type: 'workspace',
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
          parentId: 'workspaces',
          childrenIds: ['agents', 'knowledge-bases', 'connectors', 'tasks'].map(type => `${workspace.id}/${type}`),
        },
        content: workspace,
        children: [],
      };
      
      // Add child resources
      resource.children.push({
        metadata: {
          id: `${workspace.id}/agents`,
          name: 'Agents',
          description: 'List of agents in this workspace',
          type: 'agents',
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
          parentId: workspace.id,
        },
      });
      
      resource.children.push({
        metadata: {
          id: `${workspace.id}/knowledge-bases`,
          name: 'Knowledge Bases',
          description: 'List of knowledge bases in this workspace',
          type: 'knowledge-bases',
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
          parentId: workspace.id,
        },
      });
      
      resource.children.push({
        metadata: {
          id: `${workspace.id}/connectors`,
          name: 'Connectors',
          description: 'List of connectors in this workspace',
          type: 'connectors',
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
          parentId: workspace.id,
        },
      });
      
      resource.children.push({
        metadata: {
          id: `${workspace.id}/tasks`,
          name: 'Tasks',
          description: 'List of tasks in this workspace',
          type: 'tasks',
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
          parentId: workspace.id,
        },
      });
      
      return resource;
    } catch (error) {
      logger.error(`Error getting workspace resource ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get the agents resource for a workspace
   * @param workspaceId Workspace ID
   * @param apiKey API key
   * @returns Agents resource
   */
  private async getAgentsResource(workspaceId: string, apiKey: string): Promise<ResourceContent> {
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
      
      // Get agents from Dust API
      const agents = await this.dustService.listAgents(workspaceId);
      
      // Create agents resource
      const resource: ResourceContent = {
        metadata: {
          id: `${workspaceId}/agents`,
          name: 'Agents',
          description: 'List of agents in this workspace',
          type: 'agents',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          parentId: workspaceId,
          childrenIds: agents.map(agent => `${workspaceId}/agents/${agent.id}`),
        },
        content: { agents },
        children: [],
      };
      
      // Add agent children
      for (const agent of agents) {
        // Check if user has permission to access this agent
        const hasAgentPermission = await this.permissionProxy.checkPermission(
          apiKey,
          Permission.READ_AGENT,
          ResourceType.AGENT,
          `${workspaceId}/${agent.id}`
        );
        
        if (hasAgentPermission.granted) {
          resource.children.push({
            metadata: {
              id: `${workspaceId}/agents/${agent.id}`,
              name: agent.name,
              description: agent.description,
              type: 'agent',
              createdAt: agent.createdAt,
              updatedAt: agent.updatedAt,
              parentId: `${workspaceId}/agents`,
            },
          });
        }
      }
      
      return resource;
    } catch (error) {
      logger.error(`Error getting agents resource for workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get an agent resource
   * @param workspaceId Workspace ID
   * @param agentId Agent ID
   * @param apiKey API key
   * @returns Agent resource
   */
  private async getAgentResource(workspaceId: string, agentId: string, apiKey: string): Promise<ResourceContent> {
    try {
      // Check if user has permission to access this agent
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.READ_AGENT,
        ResourceType.AGENT,
        `${workspaceId}/${agentId}`
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to access this agent: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Get agent from Dust API
      const agent = await this.dustService.getAgent(workspaceId, agentId);
      
      // Create agent resource
      const resource: ResourceContent = {
        metadata: {
          id: `${workspaceId}/agents/${agentId}`,
          name: agent.name,
          description: agent.description,
          type: 'agent',
          createdAt: agent.createdAt,
          updatedAt: agent.updatedAt,
          parentId: `${workspaceId}/agents`,
        },
        content: agent,
      };
      
      return resource;
    } catch (error) {
      logger.error(`Error getting agent resource ${agentId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get the knowledge bases resource for a workspace
   * @param workspaceId Workspace ID
   * @param apiKey API key
   * @returns Knowledge bases resource
   */
  private async getKnowledgeBasesResource(workspaceId: string, apiKey: string): Promise<ResourceContent> {
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
      const knowledgeBases = await this.dustService.listKnowledgeBases(workspaceId);
      
      // Create knowledge bases resource
      const resource: ResourceContent = {
        metadata: {
          id: `${workspaceId}/knowledge-bases`,
          name: 'Knowledge Bases',
          description: 'List of knowledge bases in this workspace',
          type: 'knowledge-bases',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          parentId: workspaceId,
          childrenIds: knowledgeBases.map(kb => `${workspaceId}/knowledge-bases/${kb.id}`),
        },
        content: { knowledgeBases },
        children: [],
      };
      
      // Add knowledge base children
      for (const kb of knowledgeBases) {
        // Check if user has permission to access this knowledge base
        const hasKbPermission = await this.permissionProxy.checkPermission(
          apiKey,
          Permission.READ_KNOWLEDGE,
          ResourceType.KNOWLEDGE_BASE,
          `${workspaceId}/${kb.id}`
        );
        
        if (hasKbPermission.granted) {
          resource.children.push({
            metadata: {
              id: `${workspaceId}/knowledge-bases/${kb.id}`,
              name: kb.name,
              description: kb.description,
              type: 'knowledge-base',
              createdAt: kb.createdAt,
              updatedAt: kb.updatedAt,
              parentId: `${workspaceId}/knowledge-bases`,
            },
          });
        }
      }
      
      return resource;
    } catch (error) {
      logger.error(`Error getting knowledge bases resource for workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get a knowledge base resource
   * @param workspaceId Workspace ID
   * @param knowledgeBaseId Knowledge base ID
   * @param apiKey API key
   * @returns Knowledge base resource
   */
  private async getKnowledgeBaseResource(workspaceId: string, knowledgeBaseId: string, apiKey: string): Promise<ResourceContent> {
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
      const knowledgeBase = await this.dustService.getKnowledgeBase(workspaceId, knowledgeBaseId);
      
      // Create knowledge base resource
      const resource: ResourceContent = {
        metadata: {
          id: `${workspaceId}/knowledge-bases/${knowledgeBaseId}`,
          name: knowledgeBase.name,
          description: knowledgeBase.description,
          type: 'knowledge-base',
          createdAt: knowledgeBase.createdAt,
          updatedAt: knowledgeBase.updatedAt,
          parentId: `${workspaceId}/knowledge-bases`,
        },
        content: knowledgeBase,
      };
      
      return resource;
    } catch (error) {
      logger.error(`Error getting knowledge base resource ${knowledgeBaseId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get the connectors resource for a workspace
   * @param workspaceId Workspace ID
   * @param apiKey API key
   * @returns Connectors resource
   */
  private async getConnectorsResource(workspaceId: string, apiKey: string): Promise<ResourceContent> {
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
      
      // Get connectors from Dust API
      const connectors = await this.dustService.listConnectors(workspaceId);
      
      // Create connectors resource
      const resource: ResourceContent = {
        metadata: {
          id: `${workspaceId}/connectors`,
          name: 'Connectors',
          description: 'List of connectors in this workspace',
          type: 'connectors',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          parentId: workspaceId,
          childrenIds: connectors.map(connector => `${workspaceId}/connectors/${connector.id}`),
        },
        content: { connectors },
        children: [],
      };
      
      // Add connector children
      for (const connector of connectors) {
        // Check if user has permission to access this connector
        const hasConnectorPermission = await this.permissionProxy.checkPermission(
          apiKey,
          Permission.READ_CONNECTOR,
          ResourceType.CONNECTOR,
          `${workspaceId}/${connector.id}`
        );
        
        if (hasConnectorPermission.granted) {
          resource.children.push({
            metadata: {
              id: `${workspaceId}/connectors/${connector.id}`,
              name: connector.name,
              description: connector.description,
              type: 'connector',
              createdAt: connector.createdAt,
              updatedAt: connector.updatedAt,
              parentId: `${workspaceId}/connectors`,
            },
          });
        }
      }
      
      return resource;
    } catch (error) {
      logger.error(`Error getting connectors resource for workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get a connector resource
   * @param workspaceId Workspace ID
   * @param connectorId Connector ID
   * @param apiKey API key
   * @returns Connector resource
   */
  private async getConnectorResource(workspaceId: string, connectorId: string, apiKey: string): Promise<ResourceContent> {
    try {
      // Check if user has permission to access this connector
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.READ_CONNECTOR,
        ResourceType.CONNECTOR,
        `${workspaceId}/${connectorId}`
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to access this connector: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Get connector from Dust API
      const connector = await this.dustService.getConnector(workspaceId, connectorId);
      
      // Create connector resource
      const resource: ResourceContent = {
        metadata: {
          id: `${workspaceId}/connectors/${connectorId}`,
          name: connector.name,
          description: connector.description,
          type: 'connector',
          createdAt: connector.createdAt,
          updatedAt: connector.updatedAt,
          parentId: `${workspaceId}/connectors`,
        },
        content: connector,
      };
      
      return resource;
    } catch (error) {
      logger.error(`Error getting connector resource ${connectorId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get the tasks resource for a workspace
   * @param workspaceId Workspace ID
   * @param apiKey API key
   * @returns Tasks resource
   */
  private async getTasksResource(workspaceId: string, apiKey: string): Promise<ResourceContent> {
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
      
      // For now, we'll just return an empty tasks resource
      // In a real implementation, we would get tasks from the Dust API
      
      // Create tasks resource
      const resource: ResourceContent = {
        metadata: {
          id: `${workspaceId}/tasks`,
          name: 'Tasks',
          description: 'List of tasks in this workspace',
          type: 'tasks',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          parentId: workspaceId,
          childrenIds: [],
        },
        content: { tasks: [] },
        children: [],
      };
      
      return resource;
    } catch (error) {
      logger.error(`Error getting tasks resource for workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get a task resource
   * @param workspaceId Workspace ID
   * @param taskId Task ID
   * @param apiKey API key
   * @returns Task resource
   */
  private async getTaskResource(workspaceId: string, taskId: string, apiKey: string): Promise<ResourceContent> {
    try {
      // Check if user has permission to access this task
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.READ_TASK,
        ResourceType.TASK,
        `${workspaceId}/${taskId}`
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to access this task: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // For now, we'll just return a placeholder task resource
      // In a real implementation, we would get the task from the Dust API
      
      // Create task resource
      const resource: ResourceContent = {
        metadata: {
          id: `${workspaceId}/tasks/${taskId}`,
          name: `Task ${taskId}`,
          description: 'Task description',
          type: 'task',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          parentId: `${workspaceId}/tasks`,
        },
        content: {
          id: taskId,
          name: `Task ${taskId}`,
          description: 'Task description',
          status: 'pending',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };
      
      return resource;
    } catch (error) {
      logger.error(`Error getting task resource ${taskId} in workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Clear the resource cache
   */
  public clearCache(): void {
    this.resourceCache.clear();
    logger.debug('Resource cache cleared');
  }
}
