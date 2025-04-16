// src/middleware/session-middleware.ts
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

// Extend Express Request interface to include session ID
declare global {
  namespace Express {
    interface Request {
      mcpSessionId?: string;
      sessionData?: Record<string, any>;
    }
  }
}

// In-memory session store (replace with Redis or other store for production)
const sessions = new Map<string, {
  id: string;
  createdAt: Date;
  lastActivityAt: Date;
  data: Record<string, any>;
}>();

// Session middleware options
interface SessionMiddlewareOptions {
  createIfMissing?: boolean;
  extendSession?: boolean;
  sessionHeader?: string;
  sessionCookie?: string;
}

/**
 * Create session middleware
 * @param options Session middleware options
 */
export function createSessionMiddleware(options: SessionMiddlewareOptions = {}) {
  const {
    createIfMissing = true,
    extendSession = true,
    sessionHeader = 'mcp-session-id',
    sessionCookie = 'mcp_session_id',
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Try to get session ID from header or cookie
      let sessionId = req.headers[sessionHeader] as string;
      
      if (!sessionId && req.cookies && req.cookies[sessionCookie]) {
        sessionId = req.cookies[sessionCookie];
      }

      // If no session ID and createIfMissing is true, create a new session
      if (!sessionId && createIfMissing) {
        sessionId = uuidv4();
        
        // Set session ID in response header
        res.setHeader(sessionHeader, sessionId);
        
        // Set session ID in cookie if cookie name is provided
        if (sessionCookie) {
          res.cookie(sessionCookie, sessionId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
          });
        }
        
        // Create new session
        sessions.set(sessionId, {
          id: sessionId,
          createdAt: new Date(),
          lastActivityAt: new Date(),
          data: {},
        });
        
        logger.debug(`Created new session: ${sessionId}`);
      }

      // If session ID exists, get session data
      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId)!;
        
        // Update last activity time if extendSession is true
        if (extendSession) {
          session.lastActivityAt = new Date();
        }
        
        // Set session ID and data in request
        req.mcpSessionId = sessionId;
        req.sessionData = session.data;
        
        logger.debug(`Using existing session: ${sessionId}`);
      } else if (sessionId) {
        // Session ID exists but session not found
        logger.warn(`Session not found: ${sessionId}`);
      }

      next();
    } catch (error) {
      logger.error(`Session middleware error: ${error}`);
      next(error);
    }
  };
}

/**
 * Session activity middleware
 * Updates the last activity time for the session
 */
export function sessionActivityMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = req.mcpSessionId;
      
      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId)!;
        session.lastActivityAt = new Date();
      }
      
      next();
    } catch (error) {
      logger.error(`Session activity middleware error: ${error}`);
      next(error);
    }
  };
}

/**
 * Get session by ID
 * @param sessionId Session ID
 */
export function getSession(sessionId: string) {
  return sessions.get(sessionId);
}

/**
 * Create a new session
 * @param data Initial session data
 */
export function createSession(data: Record<string, any> = {}) {
  const sessionId = uuidv4();
  
  sessions.set(sessionId, {
    id: sessionId,
    createdAt: new Date(),
    lastActivityAt: new Date(),
    data,
  });
  
  return sessionId;
}

/**
 * Delete session by ID
 * @param sessionId Session ID
 */
export function deleteSession(sessionId: string) {
  return sessions.delete(sessionId);
}

/**
 * Clean up expired sessions
 * @param maxAge Maximum age of sessions in milliseconds
 */
export function cleanupSessions(maxAge: number = 24 * 60 * 60 * 1000) {
  const now = new Date();
  let count = 0;
  
  for (const [sessionId, session] of sessions.entries()) {
    if (now.getTime() - session.lastActivityAt.getTime() > maxAge) {
      sessions.delete(sessionId);
      count++;
    }
  }
  
  logger.info(`Cleaned up ${count} expired sessions`);
  
  return count;
}
