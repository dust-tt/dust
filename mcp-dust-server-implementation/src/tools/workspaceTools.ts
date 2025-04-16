// src/tools/workspaceTools.ts
import { z } from 'zod';
import { logger } from '../utils/logger';
import { WorkspaceService, WorkspaceMemberRole } from '../services/workspaceService';
import { MCPServer } from '../types/server';
import { APIError } from '../middleware/error-middleware';

/**
 * Workspace tools options
 */
export interface WorkspaceToolsOptions {
  workspaceService: WorkspaceService;
  mcpServer: MCPServer;
}

/**
 * Register workspace tools with the MCP server
 * @param options Workspace tools options
 */
export function registerWorkspaceTools(options: WorkspaceToolsOptions): void {
  const { workspaceService, mcpServer } = options;
  
  logger.info('Registering workspace tools');
  
  // Register create workspace tool
  mcpServer.addTool({
    name: 'dust/workspace/create',
    description: 'Create a new workspace',
    parameters: z.object({
      name: z.string().min(1).max(100),
      description: z.string().optional(),
    }),
    async execute(args, { session }) {
      try {
        const apiKey = session.user?.apiKey;
        
        if (!apiKey) {
          throw new APIError('API key is required', 401, 'UNAUTHORIZED');
        }
        
        const workspace = await workspaceService.createWorkspace(args.name, args.description, apiKey);
        
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
  
  // Register update workspace tool
  mcpServer.addTool({
    name: 'dust/workspace/update',
    description: 'Update a workspace',
    parameters: z.object({
      workspaceId: z.string().min(1),
      name: z.string().min(1).max(100).optional(),
      description: z.string().optional(),
    }),
    async execute(args, { session }) {
      try {
        const apiKey = session.user?.apiKey;
        
        if (!apiKey) {
          throw new APIError('API key is required', 401, 'UNAUTHORIZED');
        }
        
        const workspace = await workspaceService.updateWorkspace(
          args.workspaceId,
          {
            name: args.name,
            description: args.description,
          },
          apiKey
        );
        
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
  
  // Register delete workspace tool
  mcpServer.addTool({
    name: 'dust/workspace/delete',
    description: 'Delete a workspace',
    parameters: z.object({
      workspaceId: z.string().min(1),
    }),
    async execute(args, { session }) {
      try {
        const apiKey = session.user?.apiKey;
        
        if (!apiKey) {
          throw new APIError('API key is required', 401, 'UNAUTHORIZED');
        }
        
        await workspaceService.deleteWorkspace(args.workspaceId, apiKey);
        
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
  
  // Register add workspace member tool
  mcpServer.addTool({
    name: 'dust/workspace/member/add',
    description: 'Add a member to a workspace',
    parameters: z.object({
      workspaceId: z.string().min(1),
      email: z.string().email(),
      role: z.enum([
        WorkspaceMemberRole.OWNER,
        WorkspaceMemberRole.ADMIN,
        WorkspaceMemberRole.MEMBER,
        WorkspaceMemberRole.VIEWER,
      ]),
    }),
    async execute(args, { session }) {
      try {
        const apiKey = session.user?.apiKey;
        
        if (!apiKey) {
          throw new APIError('API key is required', 401, 'UNAUTHORIZED');
        }
        
        const member = await workspaceService.addWorkspaceMember(
          args.workspaceId,
          args.email,
          args.role,
          apiKey
        );
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(member),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error adding workspace member: ${error.message}`);
        throw error;
      }
    },
  });
  
  // Register update workspace member tool
  mcpServer.addTool({
    name: 'dust/workspace/member/update',
    description: 'Update a workspace member',
    parameters: z.object({
      workspaceId: z.string().min(1),
      memberId: z.string().min(1),
      role: z.enum([
        WorkspaceMemberRole.OWNER,
        WorkspaceMemberRole.ADMIN,
        WorkspaceMemberRole.MEMBER,
        WorkspaceMemberRole.VIEWER,
      ]),
    }),
    async execute(args, { session }) {
      try {
        const apiKey = session.user?.apiKey;
        
        if (!apiKey) {
          throw new APIError('API key is required', 401, 'UNAUTHORIZED');
        }
        
        const member = await workspaceService.updateWorkspaceMember(
          args.workspaceId,
          args.memberId,
          args.role,
          apiKey
        );
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(member),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error updating workspace member: ${error.message}`);
        throw error;
      }
    },
  });
  
  // Register remove workspace member tool
  mcpServer.addTool({
    name: 'dust/workspace/member/remove',
    description: 'Remove a member from a workspace',
    parameters: z.object({
      workspaceId: z.string().min(1),
      memberId: z.string().min(1),
    }),
    async execute(args, { session }) {
      try {
        const apiKey = session.user?.apiKey;
        
        if (!apiKey) {
          throw new APIError('API key is required', 401, 'UNAUTHORIZED');
        }
        
        await workspaceService.removeWorkspaceMember(
          args.workspaceId,
          args.memberId,
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
        logger.error(`Error removing workspace member: ${error.message}`);
        throw error;
      }
    },
  });
  
  // Register update workspace settings tool
  mcpServer.addTool({
    name: 'dust/workspace/settings/update',
    description: 'Update workspace settings',
    parameters: z.object({
      workspaceId: z.string().min(1),
      defaultAgentId: z.string().optional(),
      defaultKnowledgeBaseId: z.string().optional(),
      allowGuestAccess: z.boolean().optional(),
      allowPublicSharing: z.boolean().optional(),
      customSettings: z.record(z.any()).optional(),
    }),
    async execute(args, { session }) {
      try {
        const apiKey = session.user?.apiKey;
        
        if (!apiKey) {
          throw new APIError('API key is required', 401, 'UNAUTHORIZED');
        }
        
        const settings = await workspaceService.updateWorkspaceSettings(
          args.workspaceId,
          {
            defaultAgentId: args.defaultAgentId,
            defaultKnowledgeBaseId: args.defaultKnowledgeBaseId,
            allowGuestAccess: args.allowGuestAccess,
            allowPublicSharing: args.allowPublicSharing,
            customSettings: args.customSettings,
          },
          apiKey
        );
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(settings),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error updating workspace settings: ${error.message}`);
        throw error;
      }
    },
  });
  
  logger.info('Workspace tools registered');
}
