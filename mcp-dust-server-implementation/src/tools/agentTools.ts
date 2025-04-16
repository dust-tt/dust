// src/tools/agentTools.ts
import { z } from 'zod';
import { logger } from '../utils/logger';
import { AgentService } from '../services/agentService';
import { MCPServer } from '../types/server';
import { APIError } from '../middleware/error-middleware';

/**
 * Agent tools options
 */
export interface AgentToolsOptions {
  agentService: AgentService;
  mcpServer: MCPServer;
}

/**
 * Register agent tools with the MCP server
 * @param options Agent tools options
 */
export function registerAgentTools(options: AgentToolsOptions): void {
  const { agentService, mcpServer } = options;
  
  logger.info('Registering agent tools');
  
  // Register execute agent tool
  mcpServer.addTool({
    name: 'dust/agent/execute',
    description: 'Execute an agent',
    parameters: z.object({
      workspaceId: z.string().min(1),
      agentId: z.string().min(1),
      input: z.string().min(1),
      configId: z.string().optional(),
    }),
    async execute(args, { session }) {
      try {
        const apiKey = session.user?.apiKey;
        
        if (!apiKey) {
          throw new APIError('API key is required', 401, 'UNAUTHORIZED');
        }
        
        const run = await agentService.executeAgent(
          args.workspaceId,
          args.agentId,
          args.input,
          args.configId,
          apiKey
        );
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(run),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error executing agent: ${error.message}`);
        throw error;
      }
    },
  });
  
  // Register get agent run tool
  mcpServer.addTool({
    name: 'dust/agent/run/get',
    description: 'Get agent run by ID',
    parameters: z.object({
      workspaceId: z.string().min(1),
      agentId: z.string().min(1),
      runId: z.string().min(1),
    }),
    async execute(args, { session }) {
      try {
        const apiKey = session.user?.apiKey;
        
        if (!apiKey) {
          throw new APIError('API key is required', 401, 'UNAUTHORIZED');
        }
        
        const run = await agentService.getAgentRun(
          args.workspaceId,
          args.agentId,
          args.runId,
          apiKey
        );
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(run),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error getting agent run: ${error.message}`);
        throw error;
      }
    },
  });
  
  // Register list agent runs tool
  mcpServer.addTool({
    name: 'dust/agent/run/list',
    description: 'List agent runs',
    parameters: z.object({
      workspaceId: z.string().min(1),
      agentId: z.string().min(1),
    }),
    async execute(args, { session }) {
      try {
        const apiKey = session.user?.apiKey;
        
        if (!apiKey) {
          throw new APIError('API key is required', 401, 'UNAUTHORIZED');
        }
        
        const runs = await agentService.listAgentRuns(
          args.workspaceId,
          args.agentId,
          apiKey
        );
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ runs }),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error listing agent runs: ${error.message}`);
        throw error;
      }
    },
  });
  
  // Register create agent config tool
  mcpServer.addTool({
    name: 'dust/agent/config/create',
    description: 'Create agent configuration',
    parameters: z.object({
      workspaceId: z.string().min(1),
      agentId: z.string().min(1),
      name: z.string().min(1).max(100),
      description: z.string().optional(),
      parameters: z.record(z.any()).optional(),
    }),
    async execute(args, { session }) {
      try {
        const apiKey = session.user?.apiKey;
        
        if (!apiKey) {
          throw new APIError('API key is required', 401, 'UNAUTHORIZED');
        }
        
        const config = await agentService.createAgentConfig(
          args.workspaceId,
          args.agentId,
          args.name,
          args.description,
          args.parameters,
          apiKey
        );
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(config),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error creating agent configuration: ${error.message}`);
        throw error;
      }
    },
  });
  
  // Register get agent config tool
  mcpServer.addTool({
    name: 'dust/agent/config/get',
    description: 'Get agent configuration by ID',
    parameters: z.object({
      workspaceId: z.string().min(1),
      agentId: z.string().min(1),
      configId: z.string().min(1),
    }),
    async execute(args, { session }) {
      try {
        const apiKey = session.user?.apiKey;
        
        if (!apiKey) {
          throw new APIError('API key is required', 401, 'UNAUTHORIZED');
        }
        
        const config = await agentService.getAgentConfig(
          args.workspaceId,
          args.agentId,
          args.configId,
          apiKey
        );
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(config),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error getting agent configuration: ${error.message}`);
        throw error;
      }
    },
  });
  
  // Register list agent configs tool
  mcpServer.addTool({
    name: 'dust/agent/config/list',
    description: 'List agent configurations',
    parameters: z.object({
      workspaceId: z.string().min(1),
      agentId: z.string().min(1),
    }),
    async execute(args, { session }) {
      try {
        const apiKey = session.user?.apiKey;
        
        if (!apiKey) {
          throw new APIError('API key is required', 401, 'UNAUTHORIZED');
        }
        
        const configs = await agentService.listAgentConfigs(
          args.workspaceId,
          args.agentId,
          apiKey
        );
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ configs }),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error listing agent configurations: ${error.message}`);
        throw error;
      }
    },
  });
  
  // Register update agent config tool
  mcpServer.addTool({
    name: 'dust/agent/config/update',
    description: 'Update agent configuration',
    parameters: z.object({
      workspaceId: z.string().min(1),
      agentId: z.string().min(1),
      configId: z.string().min(1),
      name: z.string().min(1).max(100).optional(),
      description: z.string().optional(),
      parameters: z.record(z.any()).optional(),
    }),
    async execute(args, { session }) {
      try {
        const apiKey = session.user?.apiKey;
        
        if (!apiKey) {
          throw new APIError('API key is required', 401, 'UNAUTHORIZED');
        }
        
        const config = await agentService.updateAgentConfig(
          args.workspaceId,
          args.agentId,
          args.configId,
          args.name,
          args.description,
          args.parameters,
          apiKey
        );
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(config),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error updating agent configuration: ${error.message}`);
        throw error;
      }
    },
  });
  
  // Register delete agent config tool
  mcpServer.addTool({
    name: 'dust/agent/config/delete',
    description: 'Delete agent configuration',
    parameters: z.object({
      workspaceId: z.string().min(1),
      agentId: z.string().min(1),
      configId: z.string().min(1),
    }),
    async execute(args, { session }) {
      try {
        const apiKey = session.user?.apiKey;
        
        if (!apiKey) {
          throw new APIError('API key is required', 401, 'UNAUTHORIZED');
        }
        
        await agentService.deleteAgentConfig(
          args.workspaceId,
          args.agentId,
          args.configId,
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
        logger.error(`Error deleting agent configuration: ${error.message}`);
        throw error;
      }
    },
  });
  
  logger.info('Agent tools registered');
}
