// src/routes/connectorRoutes.ts
import { Router } from 'express';
import { ConnectorController } from '../controllers/connectorController';
import { createAuthMiddleware } from '../middleware/auth-middleware';
import { DustService } from '../services/dustService';
import { PermissionProxy } from '../services/permissionProxy';
import { EventBridge } from '../services/eventBridge';
import { ConnectorService } from '../services/connectorService';

/**
 * Create connector routes
 * @param dustService Dust service
 * @param permissionProxy Permission proxy
 * @param eventBridge Event bridge
 * @returns Router
 */
export function createConnectorRoutes(
  dustService: DustService,
  permissionProxy: PermissionProxy,
  eventBridge?: EventBridge
): Router {
  const router = Router({ mergeParams: true });
  
  // Create connector service
  const connectorService = new ConnectorService({
    dustService,
    permissionProxy,
    eventBridge,
  });
  
  // Create connector controller
  const connectorController = new ConnectorController(connectorService);
  
  // Create authentication middleware
  const authMiddleware = createAuthMiddleware({
    dustService,
    requireAuth: true,
  });
  
  // Connector routes
  router.get('/', authMiddleware, connectorController.listConnectors);
  router.get('/:connectorId', authMiddleware, connectorController.getConnector);
  
  // Connector configuration routes
  router.get('/:connectorId/configs', authMiddleware, connectorController.listConnectorConfigs);
  router.post('/:connectorId/configs', authMiddleware, connectorController.createConnectorConfig);
  router.get('/:connectorId/configs/:configId', authMiddleware, connectorController.getConnectorConfig);
  router.patch('/:connectorId/configs/:configId', authMiddleware, connectorController.updateConnectorConfig);
  router.delete('/:connectorId/configs/:configId', authMiddleware, connectorController.deleteConnectorConfig);
  
  // Connector sync routes
  router.post('/:connectorId/sync', authMiddleware, connectorController.syncConnector);
  router.get('/:connectorId/syncs', authMiddleware, connectorController.listConnectorSyncs);
  router.get('/:connectorId/syncs/:syncId', authMiddleware, connectorController.getConnectorSync);
  
  return router;
}
