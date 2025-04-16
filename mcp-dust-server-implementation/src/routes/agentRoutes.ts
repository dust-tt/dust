// src/routes/agentRoutes.ts
import { Router } from 'express';
import { AgentController } from '../controllers/agentController';
import { createAuthMiddleware } from '../middleware/auth-middleware';
import { DustService } from '../services/dustService';
import { PermissionProxy } from '../services/permissionProxy';
import { EventBridge } from '../services/eventBridge';
import { AgentService } from '../services/agentService';

/**
 * Create agent routes
 * @param dustService Dust service
 * @param permissionProxy Permission proxy
 * @param eventBridge Event bridge
 * @returns Router
 */
export function createAgentRoutes(
  dustService: DustService,
  permissionProxy: PermissionProxy,
  eventBridge?: EventBridge
): Router {
  const router = Router({ mergeParams: true });
  
  // Create agent service
  const agentService = new AgentService({
    dustService,
    permissionProxy,
    eventBridge,
  });
  
  // Create agent controller
  const agentController = new AgentController(agentService);
  
  // Create authentication middleware
  const authMiddleware = createAuthMiddleware({
    dustService,
    requireAuth: true,
  });
  
  // Agent routes
  router.get('/', authMiddleware, agentController.listAgents);
  router.get('/:agentId', authMiddleware, agentController.getAgent);
  router.post('/:agentId/execute', authMiddleware, agentController.executeAgent);
  
  // Agent run routes
  router.get('/:agentId/runs', authMiddleware, agentController.listAgentRuns);
  router.get('/:agentId/runs/:runId', authMiddleware, agentController.getAgentRun);
  
  // Agent configuration routes
  router.get('/:agentId/configs', authMiddleware, agentController.listAgentConfigs);
  router.post('/:agentId/configs', authMiddleware, agentController.createAgentConfig);
  router.get('/:agentId/configs/:configId', authMiddleware, agentController.getAgentConfig);
  router.patch('/:agentId/configs/:configId', authMiddleware, agentController.updateAgentConfig);
  router.delete('/:agentId/configs/:configId', authMiddleware, agentController.deleteAgentConfig);
  
  return router;
}
