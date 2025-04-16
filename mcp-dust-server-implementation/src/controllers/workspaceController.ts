// src/controllers/workspaceController.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { WorkspaceService, WorkspaceMemberRole } from '../services/workspaceService';
import { APIError } from '../middleware/error-middleware';

/**
 * Workspace controller for handling workspace-related API endpoints
 */
export class WorkspaceController {
  private workspaceService: WorkspaceService;
  
  /**
   * Create a new WorkspaceController
   * @param workspaceService Workspace service
   */
  constructor(workspaceService: WorkspaceService) {
    this.workspaceService = workspaceService;
    
    logger.info('WorkspaceController initialized');
  }
  
  /**
   * List workspaces
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public listWorkspaces = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Get workspaces
      const workspaces = await this.workspaceService.listWorkspaces(apiKey);
      
      // Return workspaces
      res.json({ workspaces });
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * Get workspace by ID
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public getWorkspace = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID from request parameters
      const { workspaceId } = req.params;
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Get workspace
      const workspace = await this.workspaceService.getWorkspace(workspaceId, apiKey);
      
      // Return workspace
      res.json(workspace);
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * Create a new workspace
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public createWorkspace = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace data from request body
      const { name, description } = req.body;
      
      // Validate request body
      if (!name) {
        throw new APIError('Workspace name is required', 400, 'BAD_REQUEST');
      }
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Create workspace
      const workspace = await this.workspaceService.createWorkspace(name, description, apiKey);
      
      // Return workspace
      res.status(201).json(workspace);
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * Update a workspace
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public updateWorkspace = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID from request parameters
      const { workspaceId } = req.params;
      
      // Get workspace data from request body
      const { name, description } = req.body;
      
      // Validate request body
      if (!name && !description) {
        throw new APIError('At least one field to update is required', 400, 'BAD_REQUEST');
      }
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Update workspace
      const workspace = await this.workspaceService.updateWorkspace(
        workspaceId,
        { name, description },
        apiKey
      );
      
      // Return workspace
      res.json(workspace);
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * Delete a workspace
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public deleteWorkspace = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID from request parameters
      const { workspaceId } = req.params;
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Delete workspace
      await this.workspaceService.deleteWorkspace(workspaceId, apiKey);
      
      // Return success
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * List workspace members
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public listWorkspaceMembers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID from request parameters
      const { workspaceId } = req.params;
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Get workspace members
      const members = await this.workspaceService.listWorkspaceMembers(workspaceId, apiKey);
      
      // Return workspace members
      res.json({ members });
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * Get workspace member by ID
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public getWorkspaceMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID and member ID from request parameters
      const { workspaceId, memberId } = req.params;
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Get workspace member
      const member = await this.workspaceService.getWorkspaceMember(workspaceId, memberId, apiKey);
      
      // Return workspace member
      res.json(member);
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * Add a member to a workspace
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public addWorkspaceMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID from request parameters
      const { workspaceId } = req.params;
      
      // Get member data from request body
      const { email, role } = req.body;
      
      // Validate request body
      if (!email) {
        throw new APIError('Member email is required', 400, 'BAD_REQUEST');
      }
      
      if (!role || !Object.values(WorkspaceMemberRole).includes(role as WorkspaceMemberRole)) {
        throw new APIError('Valid member role is required', 400, 'BAD_REQUEST');
      }
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Add workspace member
      const member = await this.workspaceService.addWorkspaceMember(
        workspaceId,
        email,
        role as WorkspaceMemberRole,
        apiKey
      );
      
      // Return workspace member
      res.status(201).json(member);
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * Update a workspace member
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public updateWorkspaceMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID and member ID from request parameters
      const { workspaceId, memberId } = req.params;
      
      // Get member data from request body
      const { role } = req.body;
      
      // Validate request body
      if (!role || !Object.values(WorkspaceMemberRole).includes(role as WorkspaceMemberRole)) {
        throw new APIError('Valid member role is required', 400, 'BAD_REQUEST');
      }
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Update workspace member
      const member = await this.workspaceService.updateWorkspaceMember(
        workspaceId,
        memberId,
        role as WorkspaceMemberRole,
        apiKey
      );
      
      // Return workspace member
      res.json(member);
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * Remove a member from a workspace
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public removeWorkspaceMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID and member ID from request parameters
      const { workspaceId, memberId } = req.params;
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Remove workspace member
      await this.workspaceService.removeWorkspaceMember(workspaceId, memberId, apiKey);
      
      // Return success
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * Get workspace settings
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public getWorkspaceSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID from request parameters
      const { workspaceId } = req.params;
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Get workspace settings
      const settings = await this.workspaceService.getWorkspaceSettings(workspaceId, apiKey);
      
      // Return workspace settings
      res.json(settings);
    } catch (error) {
      next(error);
    }
  };
  
  /**
   * Update workspace settings
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  public updateWorkspaceSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get workspace ID from request parameters
      const { workspaceId } = req.params;
      
      // Get settings data from request body
      const {
        defaultAgentId,
        defaultKnowledgeBaseId,
        allowGuestAccess,
        allowPublicSharing,
        customSettings,
      } = req.body;
      
      // Get API key from request
      const apiKey = req.user?.apiKey;
      
      if (!apiKey) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }
      
      // Update workspace settings
      const settings = await this.workspaceService.updateWorkspaceSettings(
        workspaceId,
        {
          defaultAgentId,
          defaultKnowledgeBaseId,
          allowGuestAccess,
          allowPublicSharing,
          customSettings,
        },
        apiKey
      );
      
      // Return workspace settings
      res.json(settings);
    } catch (error) {
      next(error);
    }
  };
}
