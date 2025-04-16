// src/routes/knowledgeBaseRoutes.ts
import { Router } from 'express';
import { KnowledgeBaseController } from '../controllers/knowledgeBaseController';
import { createAuthMiddleware } from '../middleware/auth-middleware';
import { DustService } from '../services/dustService';
import { PermissionProxy } from '../services/permissionProxy';
import { EventBridge } from '../services/eventBridge';
import { KnowledgeBaseService } from '../services/knowledgeBaseService';

/**
 * Create knowledge base routes
 * @param dustService Dust service
 * @param permissionProxy Permission proxy
 * @param eventBridge Event bridge
 * @returns Router
 */
export function createKnowledgeBaseRoutes(
  dustService: DustService,
  permissionProxy: PermissionProxy,
  eventBridge?: EventBridge
): Router {
  const router = Router({ mergeParams: true });
  
  // Create knowledge base service
  const knowledgeBaseService = new KnowledgeBaseService({
    dustService,
    permissionProxy,
    eventBridge,
  });
  
  // Create knowledge base controller
  const knowledgeBaseController = new KnowledgeBaseController(knowledgeBaseService);
  
  // Create authentication middleware
  const authMiddleware = createAuthMiddleware({
    dustService,
    requireAuth: true,
  });
  
  // Knowledge base routes
  router.get('/', authMiddleware, knowledgeBaseController.listKnowledgeBases);
  router.get('/:knowledgeBaseId', authMiddleware, knowledgeBaseController.getKnowledgeBase);
  router.post('/:knowledgeBaseId/search', authMiddleware, knowledgeBaseController.searchKnowledgeBase);
  
  // Search result routes
  router.get('/:knowledgeBaseId/search-results', authMiddleware, knowledgeBaseController.listSearchResults);
  router.get('/:knowledgeBaseId/search-results/:searchId', authMiddleware, knowledgeBaseController.getSearchResult);
  
  // Document routes
  router.get('/:knowledgeBaseId/documents', authMiddleware, knowledgeBaseController.listDocuments);
  router.post('/:knowledgeBaseId/documents', authMiddleware, knowledgeBaseController.addDocument);
  router.get('/:knowledgeBaseId/documents/:documentId', authMiddleware, knowledgeBaseController.getDocument);
  router.patch('/:knowledgeBaseId/documents/:documentId', authMiddleware, knowledgeBaseController.updateDocument);
  router.delete('/:knowledgeBaseId/documents/:documentId', authMiddleware, knowledgeBaseController.deleteDocument);
  
  return router;
}
