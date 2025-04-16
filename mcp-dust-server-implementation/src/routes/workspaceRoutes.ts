// src/routes/workspaceRoutes.ts
import { Router } from 'express';
import { WorkspaceController } from '../controllers/workspaceController';
import { createAuthMiddleware } from '../middleware/auth-middleware';
import { DustService } from '../services/dustService';
import { PermissionProxy } from '../services/permissionProxy';
import { WorkspaceService } from '../services/workspaceService';

/**
 * Create workspace routes
 * @param dustService Dust service
 * @param permissionProxy Permission proxy
 * @returns Router
 */
export function createWorkspaceRoutes(dustService: DustService, permissionProxy: PermissionProxy): Router {
  const router = Router();
  
  // Create workspace service
  const workspaceService = new WorkspaceService({
    dustService,
    permissionProxy,
  });
  
  // Create workspace controller
  const workspaceController = new WorkspaceController(workspaceService);
  
  // Create authentication middleware
  const authMiddleware = createAuthMiddleware({
    dustService,
    requireAuth: true,
  });
  
  // Workspace routes
  router.get('/', authMiddleware, workspaceController.listWorkspaces);
  router.post('/', authMiddleware, workspaceController.createWorkspace);
  router.get('/:workspaceId', authMiddleware, workspaceController.getWorkspace);
  router.patch('/:workspaceId', authMiddleware, workspaceController.updateWorkspace);
  router.delete('/:workspaceId', authMiddleware, workspaceController.deleteWorkspace);
  
  // Workspace member routes
  router.get('/:workspaceId/members', authMiddleware, workspaceController.listWorkspaceMembers);
  router.post('/:workspaceId/members', authMiddleware, workspaceController.addWorkspaceMember);
  router.get('/:workspaceId/members/:memberId', authMiddleware, workspaceController.getWorkspaceMember);
  router.patch('/:workspaceId/members/:memberId', authMiddleware, workspaceController.updateWorkspaceMember);
  router.delete('/:workspaceId/members/:memberId', authMiddleware, workspaceController.removeWorkspaceMember);
  
  // Workspace settings routes
  router.get('/:workspaceId/settings', authMiddleware, workspaceController.getWorkspaceSettings);
  router.patch('/:workspaceId/settings', authMiddleware, workspaceController.updateWorkspaceSettings);
  
  return router;
}
