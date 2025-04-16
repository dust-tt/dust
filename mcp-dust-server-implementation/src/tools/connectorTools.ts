// src/tools/connectorTools.ts
import { z } from 'zod';
import { logger } from '../utils/logger';
import { ConnectorService } from '../services/connectorService';
import { MCPServer } from '../types/server';
import { APIError } from '../middleware/error-middleware';

/**
 * Connector tools options
 */
export interface ConnectorToolsOptions {
  connectorService: ConnectorService;
  mcpServer: MCPServer;
}

/**
 * Register connector tools with the MCP server
 * @param options Connector tools options
 */
export function registerConnectorTools(options: ConnectorToolsOptions): void {
  const { connectorService, mcpServer } = options;
  
  logger.info('Registering connector tools');
  
  // Register sync connector tool
  mcpServer.addTool({
    name: 'dust/connector/sync',
    description: 'Sync a connector',
    parameters: z.object({
      workspaceId: z.string().min(1),
      connectorId: z.string().min(1),
    }),
    async execute(args, { session }) {
      try {
        const apiKey = session.user?.apiKey;
        
        if (!apiKey) {
          throw new APIError('API key is required', 401, 'UNAUTHORIZED');
        }
        
        const sync = await connectorService.syncConnector(
          args.workspaceId,
          args.connectorId,
          apiKey
        );
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(sync),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error syncing connector: ${error.message}`);
        throw error;
      }
    },
  });
  
  // Register get connector sync tool
  mcpServer.addTool({
    name: 'dust/connector/sync/get',
    description: 'Get connector sync by ID',
    parameters: z.object({
      workspaceId: z.string().min(1),
      connectorId: z.string().min(1),
      syncId: z.string().min(1),
    }),
    async execute(args, { session }) {
      try {
        const apiKey = session.user?.apiKey;
        
        if (!apiKey) {
          throw new APIError('API key is required', 401, 'UNAUTHORIZED');
        }
        
        const sync = await connectorService.getConnectorSync(
          args.workspaceId,
          args.connectorId,
          args.syncId,
          apiKey
        );
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(sync),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error getting connector sync: ${error.message}`);
        throw error;
      }
    },
  });
  
  // Register list connector syncs tool
  mcpServer.addTool({
    name: 'dust/connector/sync/list',
    description: 'List connector syncs',
    parameters: z.object({
      workspaceId: z.string().min(1),
      connectorId: z.string().min(1),
    }),
    async execute(args, { session }) {
      try {
        const apiKey = session.user?.apiKey;
        
        if (!apiKey) {
          throw new APIError('API key is required', 401, 'UNAUTHORIZED');
        }
        
        const syncs = await connectorService.listConnectorSyncs(
          args.workspaceId,
          args.connectorId,
          apiKey
        );
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ syncs }),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error listing connector syncs: ${error.message}`);
        throw error;
      }
    },
  });
  
  // Register create connector config tool
  mcpServer.addTool({
    name: 'dust/connector/config/create',
    description: 'Create connector configuration',
    parameters: z.object({
      workspaceId: z.string().min(1),
      connectorId: z.string().min(1),
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
        
        const config = await connectorService.createConnectorConfig(
          args.workspaceId,
          args.connectorId,
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
        logger.error(`Error creating connector configuration: ${error.message}`);
        throw error;
      }
    },
  });
  
  // Register get connector config tool
  mcpServer.addTool({
    name: 'dust/connector/config/get',
    description: 'Get connector configuration by ID',
    parameters: z.object({
      workspaceId: z.string().min(1),
      connectorId: z.string().min(1),
      configId: z.string().min(1),
    }),
    async execute(args, { session }) {
      try {
        const apiKey = session.user?.apiKey;
        
        if (!apiKey) {
          throw new APIError('API key is required', 401, 'UNAUTHORIZED');
        }
        
        const config = await connectorService.getConnectorConfig(
          args.workspaceId,
          args.connectorId,
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
        logger.error(`Error getting connector configuration: ${error.message}`);
        throw error;
      }
    },
  });
  
  // Register list connector configs tool
  mcpServer.addTool({
    name: 'dust/connector/config/list',
    description: 'List connector configurations',
    parameters: z.object({
      workspaceId: z.string().min(1),
      connectorId: z.string().min(1),
    }),
    async execute(args, { session }) {
      try {
        const apiKey = session.user?.apiKey;
        
        if (!apiKey) {
          throw new APIError('API key is required', 401, 'UNAUTHORIZED');
        }
        
        const configs = await connectorService.listConnectorConfigs(
          args.workspaceId,
          args.connectorId,
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
        logger.error(`Error listing connector configurations: ${error.message}`);
        throw error;
      }
    },
  });
  
  // Register update connector config tool
  mcpServer.addTool({
    name: 'dust/connector/config/update',
    description: 'Update connector configuration',
    parameters: z.object({
      workspaceId: z.string().min(1),
      connectorId: z.string().min(1),
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
        
        const config = await connectorService.updateConnectorConfig(
          args.workspaceId,
          args.connectorId,
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
        logger.error(`Error updating connector configuration: ${error.message}`);
        throw error;
      }
    },
  });
  
  // Register delete connector config tool
  mcpServer.addTool({
    name: 'dust/connector/config/delete',
    description: 'Delete connector configuration',
    parameters: z.object({
      workspaceId: z.string().min(1),
      connectorId: z.string().min(1),
      configId: z.string().min(1),
    }),
    async execute(args, { session }) {
      try {
        const apiKey = session.user?.apiKey;
        
        if (!apiKey) {
          throw new APIError('API key is required', 401, 'UNAUTHORIZED');
        }
        
        await connectorService.deleteConnectorConfig(
          args.workspaceId,
          args.connectorId,
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
        logger.error(`Error deleting connector configuration: ${error.message}`);
        throw error;
      }
    },
  });
  
  logger.info('Connector tools registered');
}
