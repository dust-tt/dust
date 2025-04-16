// src/middleware/auth-middleware.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { APIError } from './error-middleware';
import { DustService } from '../services/dustService';

// Extend Express Request interface to include user information
declare global {
  namespace Express {
    interface Request {
      user?: {
        apiKey: string;
        userId?: string;
        username?: string;
        email?: string;
        workspaceId?: string;
        permissions?: string[];
      };
    }
  }
}

/**
 * Authentication middleware options
 */
interface AuthMiddlewareOptions {
  dustService: DustService;
  requireAuth?: boolean;
  headerName?: string;
}

/**
 * Create authentication middleware
 * @param options Authentication middleware options
 */
export function createAuthMiddleware(options: AuthMiddlewareOptions) {
  const {
    dustService,
    requireAuth = true,
    headerName = 'x-dust-api-key',
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get API key from request headers
      const apiKey = req.headers[headerName] as string || req.headers['authorization']?.split(' ')[1];

      // If no API key and authentication is required, return 401
      if (!apiKey && requireAuth) {
        throw new APIError('API key is required', 401, 'UNAUTHORIZED');
      }

      // If no API key and authentication is not required, continue
      if (!apiKey) {
        logger.debug('No API key provided, but authentication is not required');
        return next();
      }

      // Set user context on request
      req.user = { apiKey };

      // Validate API key
      try {
        // Get user information
        const userInfo = await dustService.getUserInfo();
        
        // Set user information on request
        req.user.userId = userInfo.id;
        req.user.username = userInfo.username;
        req.user.email = userInfo.email;
        req.user.workspaceId = userInfo.workspaceId;
        
        logger.debug(`Authenticated user: ${req.user.username} (${req.user.email})`);
      } catch (error) {
        // If API key validation fails and authentication is required, return 401
        if (requireAuth) {
          logger.error(`Authentication failed: ${error.message}`);
          throw new APIError('Invalid API key', 401, 'UNAUTHORIZED');
        }
        
        // If API key validation fails and authentication is not required, continue
        logger.warn(`API key validation failed, but authentication is not required: ${error.message}`);
      }

      next();
    } catch (error) {
      // If error is already an APIError, pass it to the next error handler
      if (error instanceof APIError) {
        next(error);
        return;
      }
      
      // Otherwise, wrap it in an APIError
      logger.error(`Authentication error: ${error.message}`);
      next(new APIError(`Authentication error: ${error.message}`, 500, 'INTERNAL_SERVER_ERROR'));
    }
  };
}

/**
 * Create workspace access middleware
 * @param options Authentication middleware options
 */
export function createWorkspaceAccessMiddleware(options: AuthMiddlewareOptions) {
  const { dustService } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get workspace ID from request parameters
      const workspaceId = req.params.workspaceId;

      // If no workspace ID, continue
      if (!workspaceId) {
        return next();
      }

      // If no user, return 401
      if (!req.user) {
        throw new APIError('Authentication required', 401, 'UNAUTHORIZED');
      }

      // Check if user has access to workspace
      try {
        // Get workspace information
        await dustService.getWorkspace(workspaceId);
        
        logger.debug(`User ${req.user.username} has access to workspace ${workspaceId}`);
      } catch (error) {
        logger.error(`Workspace access check failed: ${error.message}`);
        throw new APIError('You do not have access to this workspace', 403, 'FORBIDDEN');
      }

      next();
    } catch (error) {
      // If error is already an APIError, pass it to the next error handler
      if (error instanceof APIError) {
        next(error);
        return;
      }
      
      // Otherwise, wrap it in an APIError
      logger.error(`Workspace access error: ${error.message}`);
      next(new APIError(`Workspace access error: ${error.message}`, 500, 'INTERNAL_SERVER_ERROR'));
    }
  };
}

/**
 * Create agent access middleware
 * @param options Authentication middleware options
 */
export function createAgentAccessMiddleware(options: AuthMiddlewareOptions) {
  const { dustService } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get workspace ID and agent ID from request parameters
      const workspaceId = req.params.workspaceId;
      const agentId = req.params.agentId;

      // If no workspace ID or agent ID, continue
      if (!workspaceId || !agentId) {
        return next();
      }

      // If no user, return 401
      if (!req.user) {
        throw new APIError('Authentication required', 401, 'UNAUTHORIZED');
      }

      // Check if user has access to agent
      try {
        // Get agent information
        await dustService.getAgent(workspaceId, agentId);
        
        logger.debug(`User ${req.user.username} has access to agent ${agentId} in workspace ${workspaceId}`);
      } catch (error) {
        logger.error(`Agent access check failed: ${error.message}`);
        throw new APIError('You do not have access to this agent', 403, 'FORBIDDEN');
      }

      next();
    } catch (error) {
      // If error is already an APIError, pass it to the next error handler
      if (error instanceof APIError) {
        next(error);
        return;
      }
      
      // Otherwise, wrap it in an APIError
      logger.error(`Agent access error: ${error.message}`);
      next(new APIError(`Agent access error: ${error.message}`, 500, 'INTERNAL_SERVER_ERROR'));
    }
  };
}

/**
 * Create knowledge base access middleware
 * @param options Authentication middleware options
 */
export function createKnowledgeBaseAccessMiddleware(options: AuthMiddlewareOptions) {
  const { dustService } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get workspace ID and knowledge base ID from request parameters
      const workspaceId = req.params.workspaceId;
      const knowledgeBaseId = req.params.knowledgeBaseId;

      // If no workspace ID or knowledge base ID, continue
      if (!workspaceId || !knowledgeBaseId) {
        return next();
      }

      // If no user, return 401
      if (!req.user) {
        throw new APIError('Authentication required', 401, 'UNAUTHORIZED');
      }

      // Check if user has access to knowledge base
      try {
        // Get knowledge base information
        await dustService.getKnowledgeBase(workspaceId, knowledgeBaseId);
        
        logger.debug(`User ${req.user.username} has access to knowledge base ${knowledgeBaseId} in workspace ${workspaceId}`);
      } catch (error) {
        logger.error(`Knowledge base access check failed: ${error.message}`);
        throw new APIError('You do not have access to this knowledge base', 403, 'FORBIDDEN');
      }

      next();
    } catch (error) {
      // If error is already an APIError, pass it to the next error handler
      if (error instanceof APIError) {
        next(error);
        return;
      }
      
      // Otherwise, wrap it in an APIError
      logger.error(`Knowledge base access error: ${error.message}`);
      next(new APIError(`Knowledge base access error: ${error.message}`, 500, 'INTERNAL_SERVER_ERROR'));
    }
  };
}
