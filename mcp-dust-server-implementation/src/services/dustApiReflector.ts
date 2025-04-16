// src/services/dustApiReflector.ts
import { logger } from '../utils/logger';
import { DustService } from './dustService';
import { MCPServer } from '../types/server';
import { z } from 'zod';
import { APIError } from '../middleware/error-middleware';

/**
 * Resource template for MCP resources
 */
export interface ResourceTemplate {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType: string;
  arguments?: ResourceArgument[];
  load: (args: Record<string, string>, context: { session: any }) => Promise<{ text: string }>;
}

/**
 * Resource argument for MCP resource templates
 */
export interface ResourceArgument {
  name: string;
  description?: string;
  required?: boolean;
}

/**
 * Tool template for MCP tools
 */
export interface ToolTemplate {
  name: string;
  description?: string;
  parameters: z.ZodObject<any>;
  execute: (args: any, context: { session: any }) => Promise<any>;
}

/**
 * API Reflection Layer for mapping Dust's API to MCP resources and tools
 */
export class DustApiReflector {
  private dustService: DustService;
  private mcpServer: MCPServer;
  private resourceTemplates: Map<string, ResourceTemplate>;
  private toolTemplates: Map<string, ToolTemplate>;
  
  /**
   * Create a new DustApiReflector
   * @param dustService DustService instance
   * @param mcpServer MCPServer instance
   */
  constructor(dustService: DustService, mcpServer: MCPServer) {
    this.dustService = dustService;
    this.mcpServer = mcpServer;
    this.resourceTemplates = new Map();
    this.toolTemplates = new Map();
    
    logger.info('DustApiReflector initialized');
  }
  
  /**
   * Reflect the Dust API to MCP resources and tools
   */
  public reflectApi(): void {
    logger.info('Reflecting Dust API to MCP resources and tools');
    
    // Reflect workspace endpoints
    this.reflectWorkspaceApi();
    
    // Reflect agent endpoints
    this.reflectAgentApi();
    
    // Reflect knowledge base endpoints
    this.reflectKnowledgeBaseApi();
    
    // Reflect connector endpoints
    this.reflectConnectorApi();
    
    logger.info('Dust API reflection completed');
  }
  
  /**
   * Reflect workspace endpoints
   */
  private reflectWorkspaceApi(): void {
    logger.info('Reflecting workspace endpoints');
    
    // Register workspace listing as a resource
    this.addResourceTemplate({
      uriTemplate: 'dust://workspaces',
      name: 'Workspaces',
      description: 'List of workspaces',
      mimeType: 'application/json',
      async load(_, { session }) {
        try {
          const dustService = session.data.dustService;
          const workspaces = await dustService.listWorkspaces();
          
          return { text: JSON.stringify(workspaces) };
        } catch (error) {
          logger.error(`Error loading workspaces: ${error.message}`);
          throw error;
        }
      },
    });
    
    // Register individual workspace access as a resource
    this.addResourceTemplate({
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
          const dustService = session.data.dustService;
          const permissionProxy = session.data.permissionProxy;
          
          // Check if user has permission to access this workspace
          const hasPermission = await permissionProxy.checkPermission(
            session.user?.apiKey,
            'read:workspace',
            'workspace',
            workspaceId
          );
          
          if (!hasPermission.granted) {
            throw new APIError(
              `You don't have permission to access this workspace: ${hasPermission.reason}`,
              403,
              'FORBIDDEN'
            );
          }
          
          const workspace = await dustService.getWorkspace(workspaceId);
          
          return { text: JSON.stringify(workspace) };
        } catch (error) {
          logger.error(`Error loading workspace ${workspaceId}: ${error.message}`);
          throw error;
        }
      },
    });
    
    // Register workspace creation as a tool
    this.addToolTemplate({
      name: 'dust/workspace/create',
      description: 'Create a new workspace',
      parameters: z.object({
        name: z.string().min(1).max(100),
        description: z.string().optional(),
      }),
      async execute(args, { session }) {
        try {
          const dustService = session.data.dustService;
          
          const workspace = await dustService.createWorkspace(args.name, args.description);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(workspace),
              },
            ],
          };
        } catch (error) {
          logger.error(`Error creating workspace: ${error.message}`);
          throw error;
        }
      },
    });
    
    // Register workspace update as a tool
    this.addToolTemplate({
      name: 'dust/workspace/update',
      description: 'Update a workspace',
      parameters: z.object({
        workspaceId: z.string().min(1),
        name: z.string().min(1).max(100).optional(),
        description: z.string().optional(),
      }),
      async execute(args, { session }) {
        try {
          const dustService = session.data.dustService;
          const permissionProxy = session.data.permissionProxy;
          
          // Check if user has permission to update this workspace
          const hasPermission = await permissionProxy.checkPermission(
            session.user?.apiKey,
            'write:workspace',
            'workspace',
            args.workspaceId
          );
          
          if (!hasPermission.granted) {
            throw new APIError(
              `You don't have permission to update this workspace: ${hasPermission.reason}`,
              403,
              'FORBIDDEN'
            );
          }
          
          const updates = {
            name: args.name,
            description: args.description,
          };
          
          const workspace = await dustService.updateWorkspace(args.workspaceId, updates);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(workspace),
              },
            ],
          };
        } catch (error) {
          logger.error(`Error updating workspace: ${error.message}`);
          throw error;
        }
      },
    });
    
    // Register workspace deletion as a tool
    this.addToolTemplate({
      name: 'dust/workspace/delete',
      description: 'Delete a workspace',
      parameters: z.object({
        workspaceId: z.string().min(1),
      }),
      async execute(args, { session }) {
        try {
          const dustService = session.data.dustService;
          const permissionProxy = session.data.permissionProxy;
          
          // Check if user has permission to delete this workspace
          const hasPermission = await permissionProxy.checkPermission(
            session.user?.apiKey,
            'delete:workspace',
            'workspace',
            args.workspaceId
          );
          
          if (!hasPermission.granted) {
            throw new APIError(
              `You don't have permission to delete this workspace: ${hasPermission.reason}`,
              403,
              'FORBIDDEN'
            );
          }
          
          await dustService.deleteWorkspace(args.workspaceId);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ success: true }),
              },
            ],
          };
        } catch (error) {
          logger.error(`Error deleting workspace: ${error.message}`);
          throw error;
        }
      },
    });
  }
  
  /**
   * Reflect agent endpoints
   */
  private reflectAgentApi(): void {
    logger.info('Reflecting agent endpoints');
    
    // Register agent listing as a resource
    this.addResourceTemplate({
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
          const dustService = session.data.dustService;
          const permissionProxy = session.data.permissionProxy;
          
          // Check if user has permission to access this workspace
          const hasPermission = await permissionProxy.checkPermission(
            session.user?.apiKey,
            'read:workspace',
            'workspace',
            workspaceId
          );
          
          if (!hasPermission.granted) {
            throw new APIError(
              `You don't have permission to access this workspace: ${hasPermission.reason}`,
              403,
              'FORBIDDEN'
            );
          }
          
          const agents = await dustService.listAgents(workspaceId);
          
          return { text: JSON.stringify(agents) };
        } catch (error) {
          logger.error(`Error loading agents for workspace ${workspaceId}: ${error.message}`);
          throw error;
        }
      },
    });
    
    // Register individual agent access as a resource
    this.addResourceTemplate({
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
          const dustService = session.data.dustService;
          const permissionProxy = session.data.permissionProxy;
          
          // Check if user has permission to access this agent
          const hasPermission = await permissionProxy.checkPermission(
            session.user?.apiKey,
            'read:agent',
            'agent',
            `${workspaceId}/${agentId}`
          );
          
          if (!hasPermission.granted) {
            throw new APIError(
              `You don't have permission to access this agent: ${hasPermission.reason}`,
              403,
              'FORBIDDEN'
            );
          }
          
          const agent = await dustService.getAgent(workspaceId, agentId);
          
          return { text: JSON.stringify(agent) };
        } catch (error) {
          logger.error(`Error loading agent ${agentId} in workspace ${workspaceId}: ${error.message}`);
          throw error;
        }
      },
    });
    
    // Register agent execution as a tool
    this.addToolTemplate({
      name: 'dust/agent/execute',
      description: 'Execute an agent',
      parameters: z.object({
        workspaceId: z.string().min(1),
        agentId: z.string().min(1),
        input: z.string().min(1),
      }),
      async execute(args, { session }) {
        try {
          const dustService = session.data.dustService;
          const permissionProxy = session.data.permissionProxy;
          
          // Check if user has permission to execute this agent
          const hasPermission = await permissionProxy.checkPermission(
            session.user?.apiKey,
            'execute:agent',
            'agent',
            `${args.workspaceId}/${args.agentId}`
          );
          
          if (!hasPermission.granted) {
            throw new APIError(
              `You don't have permission to execute this agent: ${hasPermission.reason}`,
              403,
              'FORBIDDEN'
            );
          }
          
          const execution = await dustService.executeAgent(args.workspaceId, args.agentId, args.input);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(execution),
              },
            ],
          };
        } catch (error) {
          logger.error(`Error executing agent: ${error.message}`);
          throw error;
        }
      },
    });
    
    // Register agent execution status as a resource
    this.addResourceTemplate({
      uriTemplate: 'dust://workspaces/{workspaceId}/agents/{agentId}/executions/{executionId}',
      name: 'Agent Execution',
      description: 'Agent execution details',
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
        {
          name: 'executionId',
          description: 'ID of the execution',
          required: true,
        },
      ],
      async load({ workspaceId, agentId, executionId }, { session }) {
        try {
          const dustService = session.data.dustService;
          const permissionProxy = session.data.permissionProxy;
          
          // Check if user has permission to access this agent
          const hasPermission = await permissionProxy.checkPermission(
            session.user?.apiKey,
            'read:agent',
            'agent',
            `${workspaceId}/${agentId}`
          );
          
          if (!hasPermission.granted) {
            throw new APIError(
              `You don't have permission to access this agent: ${hasPermission.reason}`,
              403,
              'FORBIDDEN'
            );
          }
          
          const execution = await dustService.getAgentExecution(workspaceId, agentId, executionId);
          
          return { text: JSON.stringify(execution) };
        } catch (error) {
          logger.error(`Error loading agent execution ${executionId}: ${error.message}`);
          throw error;
        }
      },
    });
  }
  
  /**
   * Reflect knowledge base endpoints
   */
  private reflectKnowledgeBaseApi(): void {
    logger.info('Reflecting knowledge base endpoints');
    
    // Register knowledge base listing as a resource
    this.addResourceTemplate({
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
          const dustService = session.data.dustService;
          const permissionProxy = session.data.permissionProxy;
          
          // Check if user has permission to access this workspace
          const hasPermission = await permissionProxy.checkPermission(
            session.user?.apiKey,
            'read:workspace',
            'workspace',
            workspaceId
          );
          
          if (!hasPermission.granted) {
            throw new APIError(
              `You don't have permission to access this workspace: ${hasPermission.reason}`,
              403,
              'FORBIDDEN'
            );
          }
          
          const knowledgeBases = await dustService.listKnowledgeBases(workspaceId);
          
          return { text: JSON.stringify(knowledgeBases) };
        } catch (error) {
          logger.error(`Error loading knowledge bases for workspace ${workspaceId}: ${error.message}`);
          throw error;
        }
      },
    });
    
    // Register individual knowledge base access as a resource
    this.addResourceTemplate({
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
          const dustService = session.data.dustService;
          const permissionProxy = session.data.permissionProxy;
          
          // Check if user has permission to access this knowledge base
          const hasPermission = await permissionProxy.checkPermission(
            session.user?.apiKey,
            'read:knowledge',
            'knowledge_base',
            `${workspaceId}/${knowledgeBaseId}`
          );
          
          if (!hasPermission.granted) {
            throw new APIError(
              `You don't have permission to access this knowledge base: ${hasPermission.reason}`,
              403,
              'FORBIDDEN'
            );
          }
          
          const knowledgeBase = await dustService.getKnowledgeBase(workspaceId, knowledgeBaseId);
          
          return { text: JSON.stringify(knowledgeBase) };
        } catch (error) {
          logger.error(`Error loading knowledge base ${knowledgeBaseId} in workspace ${workspaceId}: ${error.message}`);
          throw error;
        }
      },
    });
    
    // Register knowledge base search as a tool
    this.addToolTemplate({
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
          const dustService = session.data.dustService;
          const permissionProxy = session.data.permissionProxy;
          
          // Check if user has permission to access this knowledge base
          const hasPermission = await permissionProxy.checkPermission(
            session.user?.apiKey,
            'read:knowledge',
            'knowledge_base',
            `${args.workspaceId}/${args.knowledgeBaseId}`
          );
          
          if (!hasPermission.granted) {
            throw new APIError(
              `You don't have permission to access this knowledge base: ${hasPermission.reason}`,
              403,
              'FORBIDDEN'
            );
          }
          
          const results = await dustService.searchKnowledgeBase(
            args.workspaceId,
            args.knowledgeBaseId,
            args.query,
            args.limit
          );
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(results),
              },
            ],
          };
        } catch (error) {
          logger.error(`Error searching knowledge base: ${error.message}`);
          throw error;
        }
      },
    });
  }
  
  /**
   * Reflect connector endpoints
   */
  private reflectConnectorApi(): void {
    logger.info('Reflecting connector endpoints');
    
    // Register connector listing as a resource
    this.addResourceTemplate({
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
          const dustService = session.data.dustService;
          const permissionProxy = session.data.permissionProxy;
          
          // Check if user has permission to access this workspace
          const hasPermission = await permissionProxy.checkPermission(
            session.user?.apiKey,
            'read:workspace',
            'workspace',
            workspaceId
          );
          
          if (!hasPermission.granted) {
            throw new APIError(
              `You don't have permission to access this workspace: ${hasPermission.reason}`,
              403,
              'FORBIDDEN'
            );
          }
          
          const connectors = await dustService.listConnectors(workspaceId);
          
          return { text: JSON.stringify(connectors) };
        } catch (error) {
          logger.error(`Error loading connectors for workspace ${workspaceId}: ${error.message}`);
          throw error;
        }
      },
    });
    
    // Register individual connector access as a resource
    this.addResourceTemplate({
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
          const dustService = session.data.dustService;
          const permissionProxy = session.data.permissionProxy;
          
          // Check if user has permission to access this connector
          const hasPermission = await permissionProxy.checkPermission(
            session.user?.apiKey,
            'read:connector',
            'connector',
            `${workspaceId}/${connectorId}`
          );
          
          if (!hasPermission.granted) {
            throw new APIError(
              `You don't have permission to access this connector: ${hasPermission.reason}`,
              403,
              'FORBIDDEN'
            );
          }
          
          const connector = await dustService.getConnector(workspaceId, connectorId);
          
          return { text: JSON.stringify(connector) };
        } catch (error) {
          logger.error(`Error loading connector ${connectorId} in workspace ${workspaceId}: ${error.message}`);
          throw error;
        }
      },
    });
    
    // Register connector data access as a tool
    this.addToolTemplate({
      name: 'dust/connector/data',
      description: 'Get data from a connector',
      parameters: z.object({
        workspaceId: z.string().min(1),
        connectorId: z.string().min(1),
        query: z.record(z.any()),
      }),
      async execute(args, { session }) {
        try {
          const dustService = session.data.dustService;
          const permissionProxy = session.data.permissionProxy;
          
          // Check if user has permission to access this connector
          const hasPermission = await permissionProxy.checkPermission(
            session.user?.apiKey,
            'read:connector',
            'connector',
            `${args.workspaceId}/${args.connectorId}`
          );
          
          if (!hasPermission.granted) {
            throw new APIError(
              `You don't have permission to access this connector: ${hasPermission.reason}`,
              403,
              'FORBIDDEN'
            );
          }
          
          const data = await dustService.getConnectorData(
            args.workspaceId,
            args.connectorId,
            args.query
          );
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(data),
              },
            ],
          };
        } catch (error) {
          logger.error(`Error getting connector data: ${error.message}`);
          throw error;
        }
      },
    });
  }
  
  /**
   * Add a resource template
   * @param template Resource template
   */
  public addResourceTemplate(template: ResourceTemplate): void {
    this.resourceTemplates.set(template.uriTemplate, template);
    
    // Register resource template with MCP server
    this.mcpServer.addResourceTemplate(template);
    
    logger.info(`Added resource template: ${template.uriTemplate}`);
  }
  
  /**
   * Add a tool template
   * @param template Tool template
   */
  public addToolTemplate(template: ToolTemplate): void {
    this.toolTemplates.set(template.name, template);
    
    // Register tool template with MCP server
    this.mcpServer.addTool(template);
    
    logger.info(`Added tool template: ${template.name}`);
  }
  
  /**
   * Get a resource template by URI template
   * @param uriTemplate URI template
   * @returns Resource template
   */
  public getResourceTemplate(uriTemplate: string): ResourceTemplate | undefined {
    return this.resourceTemplates.get(uriTemplate);
  }
  
  /**
   * Get a tool template by name
   * @param name Tool name
   * @returns Tool template
   */
  public getToolTemplate(name: string): ToolTemplate | undefined {
    return this.toolTemplates.get(name);
  }
  
  /**
   * Get all resource templates
   * @returns Resource templates
   */
  public getAllResourceTemplates(): ResourceTemplate[] {
    return Array.from(this.resourceTemplates.values());
  }
  
  /**
   * Get all tool templates
   * @returns Tool templates
   */
  public getAllToolTemplates(): ToolTemplate[] {
    return Array.from(this.toolTemplates.values());
  }
}
