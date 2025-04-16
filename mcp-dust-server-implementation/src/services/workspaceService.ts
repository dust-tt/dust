// src/services/workspaceService.ts
import { logger } from '../utils/logger';
import { DustService, DustWorkspace, WorkspaceUpdates } from './dustService';
import { PermissionProxy, Permission, ResourceType } from './permissionProxy';
import { APIError } from '../middleware/error-middleware';

/**
 * Workspace member role
 */
export enum WorkspaceMemberRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

/**
 * Workspace member
 */
export interface WorkspaceMember {
  id: string;
  userId: string;
  username: string;
  email: string;
  fullName?: string;
  role: WorkspaceMemberRole;
  createdAt: string;
  updatedAt: string;
}

/**
 * Workspace settings
 */
export interface WorkspaceSettings {
  id: string;
  workspaceId: string;
  defaultAgentId?: string;
  defaultKnowledgeBaseId?: string;
  allowGuestAccess: boolean;
  allowPublicSharing: boolean;
  createdAt: string;
  updatedAt: string;
  customSettings?: Record<string, any>;
}

/**
 * Workspace service options
 */
export interface WorkspaceServiceOptions {
  dustService: DustService;
  permissionProxy: PermissionProxy;
}

/**
 * Workspace service for managing workspaces
 */
export class WorkspaceService {
  private dustService: DustService;
  private permissionProxy: PermissionProxy;
  
  /**
   * Create a new WorkspaceService
   * @param options Workspace service options
   */
  constructor(options: WorkspaceServiceOptions) {
    this.dustService = options.dustService;
    this.permissionProxy = options.permissionProxy;
    
    logger.info('WorkspaceService initialized');
  }
  
  /**
   * List workspaces
   * @param apiKey API key
   * @returns List of workspaces
   */
  public async listWorkspaces(apiKey: string): Promise<DustWorkspace[]> {
    try {
      // Get workspaces from Dust API
      const workspaces = await this.dustService.listWorkspaces();
      
      // Filter workspaces based on permissions
      const filteredWorkspaces: DustWorkspace[] = [];
      
      for (const workspace of workspaces) {
        // Check if user has permission to access this workspace
        const hasPermission = await this.permissionProxy.checkPermission(
          apiKey,
          Permission.READ_WORKSPACE,
          ResourceType.WORKSPACE,
          workspace.id
        );
        
        if (hasPermission.granted) {
          filteredWorkspaces.push(workspace);
        }
      }
      
      return filteredWorkspaces;
    } catch (error) {
      logger.error(`Error listing workspaces: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get workspace by ID
   * @param workspaceId Workspace ID
   * @param apiKey API key
   * @returns Workspace details
   */
  public async getWorkspace(workspaceId: string, apiKey: string): Promise<DustWorkspace> {
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
      return this.dustService.getWorkspace(workspaceId);
    } catch (error) {
      logger.error(`Error getting workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Create a new workspace
   * @param name Workspace name
   * @param description Workspace description
   * @param apiKey API key
   * @returns Created workspace
   */
  public async createWorkspace(name: string, description: string | undefined, apiKey: string): Promise<DustWorkspace> {
    try {
      // Create workspace using Dust API
      const workspace = await this.dustService.createWorkspace(name, description);
      
      // Initialize workspace settings
      await this.initializeWorkspaceSettings(workspace.id, apiKey);
      
      return workspace;
    } catch (error) {
      logger.error(`Error creating workspace: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Update a workspace
   * @param workspaceId Workspace ID
   * @param updates Workspace updates
   * @param apiKey API key
   * @returns Updated workspace
   */
  public async updateWorkspace(
    workspaceId: string,
    updates: WorkspaceUpdates,
    apiKey: string
  ): Promise<DustWorkspace> {
    try {
      // Check if user has permission to update this workspace
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.WRITE_WORKSPACE,
        ResourceType.WORKSPACE,
        workspaceId
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to update this workspace: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Update workspace using Dust API
      return this.dustService.updateWorkspace(workspaceId, updates);
    } catch (error) {
      logger.error(`Error updating workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Delete a workspace
   * @param workspaceId Workspace ID
   * @param apiKey API key
   */
  public async deleteWorkspace(workspaceId: string, apiKey: string): Promise<void> {
    try {
      // Check if user has permission to delete this workspace
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.DELETE_WORKSPACE,
        ResourceType.WORKSPACE,
        workspaceId
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to delete this workspace: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // Delete workspace using Dust API
      await this.dustService.deleteWorkspace(workspaceId);
    } catch (error) {
      logger.error(`Error deleting workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * List workspace members
   * @param workspaceId Workspace ID
   * @param apiKey API key
   * @returns List of workspace members
   */
  public async listWorkspaceMembers(workspaceId: string, apiKey: string): Promise<WorkspaceMember[]> {
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
      
      // For now, we'll return a placeholder list of members
      // In a real implementation, we would get members from the Dust API
      
      return [
        {
          id: 'member-1',
          userId: 'user-1',
          username: 'user1',
          email: 'user1@example.com',
          fullName: 'User One',
          role: WorkspaceMemberRole.OWNER,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'member-2',
          userId: 'user-2',
          username: 'user2',
          email: 'user2@example.com',
          fullName: 'User Two',
          role: WorkspaceMemberRole.ADMIN,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'member-3',
          userId: 'user-3',
          username: 'user3',
          email: 'user3@example.com',
          fullName: 'User Three',
          role: WorkspaceMemberRole.MEMBER,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    } catch (error) {
      logger.error(`Error listing workspace members for workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get workspace member by ID
   * @param workspaceId Workspace ID
   * @param memberId Member ID
   * @param apiKey API key
   * @returns Workspace member
   */
  public async getWorkspaceMember(
    workspaceId: string,
    memberId: string,
    apiKey: string
  ): Promise<WorkspaceMember> {
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
      
      // For now, we'll return a placeholder member
      // In a real implementation, we would get the member from the Dust API
      
      return {
        id: memberId,
        userId: 'user-1',
        username: 'user1',
        email: 'user1@example.com',
        fullName: 'User One',
        role: WorkspaceMemberRole.OWNER,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(`Error getting workspace member ${memberId} for workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Add a member to a workspace
   * @param workspaceId Workspace ID
   * @param email Member email
   * @param role Member role
   * @param apiKey API key
   * @returns Added workspace member
   */
  public async addWorkspaceMember(
    workspaceId: string,
    email: string,
    role: WorkspaceMemberRole,
    apiKey: string
  ): Promise<WorkspaceMember> {
    try {
      // Check if user has permission to update this workspace
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.WRITE_WORKSPACE,
        ResourceType.WORKSPACE,
        workspaceId
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to update this workspace: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // For now, we'll return a placeholder member
      // In a real implementation, we would add the member to the Dust API
      
      return {
        id: 'member-new',
        userId: 'user-new',
        username: 'usernew',
        email,
        fullName: 'New User',
        role,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(`Error adding workspace member to workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Update a workspace member
   * @param workspaceId Workspace ID
   * @param memberId Member ID
   * @param role Member role
   * @param apiKey API key
   * @returns Updated workspace member
   */
  public async updateWorkspaceMember(
    workspaceId: string,
    memberId: string,
    role: WorkspaceMemberRole,
    apiKey: string
  ): Promise<WorkspaceMember> {
    try {
      // Check if user has permission to update this workspace
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.WRITE_WORKSPACE,
        ResourceType.WORKSPACE,
        workspaceId
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to update this workspace: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // For now, we'll return a placeholder member
      // In a real implementation, we would update the member in the Dust API
      
      return {
        id: memberId,
        userId: 'user-1',
        username: 'user1',
        email: 'user1@example.com',
        fullName: 'User One',
        role,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(`Error updating workspace member ${memberId} for workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Remove a member from a workspace
   * @param workspaceId Workspace ID
   * @param memberId Member ID
   * @param apiKey API key
   */
  public async removeWorkspaceMember(workspaceId: string, memberId: string, apiKey: string): Promise<void> {
    try {
      // Check if user has permission to update this workspace
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.WRITE_WORKSPACE,
        ResourceType.WORKSPACE,
        workspaceId
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to update this workspace: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // For now, we'll just log the removal
      // In a real implementation, we would remove the member from the Dust API
      
      logger.info(`Removed workspace member ${memberId} from workspace ${workspaceId}`);
    } catch (error) {
      logger.error(`Error removing workspace member ${memberId} from workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get workspace settings
   * @param workspaceId Workspace ID
   * @param apiKey API key
   * @returns Workspace settings
   */
  public async getWorkspaceSettings(workspaceId: string, apiKey: string): Promise<WorkspaceSettings> {
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
      
      // For now, we'll return placeholder settings
      // In a real implementation, we would get settings from the Dust API
      
      return {
        id: `${workspaceId}-settings`,
        workspaceId,
        allowGuestAccess: false,
        allowPublicSharing: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        customSettings: {
          theme: 'light',
          language: 'en',
        },
      };
    } catch (error) {
      logger.error(`Error getting workspace settings for workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Update workspace settings
   * @param workspaceId Workspace ID
   * @param settings Workspace settings updates
   * @param apiKey API key
   * @returns Updated workspace settings
   */
  public async updateWorkspaceSettings(
    workspaceId: string,
    settings: Partial<WorkspaceSettings>,
    apiKey: string
  ): Promise<WorkspaceSettings> {
    try {
      // Check if user has permission to update this workspace
      const hasPermission = await this.permissionProxy.checkPermission(
        apiKey,
        Permission.WRITE_WORKSPACE,
        ResourceType.WORKSPACE,
        workspaceId
      );
      
      if (!hasPermission.granted) {
        throw new APIError(
          `You don't have permission to update this workspace: ${hasPermission.reason}`,
          403,
          'FORBIDDEN'
        );
      }
      
      // For now, we'll return placeholder settings
      // In a real implementation, we would update settings in the Dust API
      
      return {
        id: `${workspaceId}-settings`,
        workspaceId,
        defaultAgentId: settings.defaultAgentId,
        defaultKnowledgeBaseId: settings.defaultKnowledgeBaseId,
        allowGuestAccess: settings.allowGuestAccess ?? false,
        allowPublicSharing: settings.allowPublicSharing ?? false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        customSettings: settings.customSettings ?? {
          theme: 'light',
          language: 'en',
        },
      };
    } catch (error) {
      logger.error(`Error updating workspace settings for workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Initialize workspace settings
   * @param workspaceId Workspace ID
   * @param apiKey API key
   * @returns Initialized workspace settings
   */
  private async initializeWorkspaceSettings(workspaceId: string, apiKey: string): Promise<WorkspaceSettings> {
    try {
      // For now, we'll return placeholder settings
      // In a real implementation, we would initialize settings in the Dust API
      
      return {
        id: `${workspaceId}-settings`,
        workspaceId,
        allowGuestAccess: false,
        allowPublicSharing: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        customSettings: {
          theme: 'light',
          language: 'en',
        },
      };
    } catch (error) {
      logger.error(`Error initializing workspace settings for workspace ${workspaceId}: ${error.message}`);
      throw error;
    }
  }
}
