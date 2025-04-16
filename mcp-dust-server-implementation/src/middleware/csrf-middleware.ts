// src/middleware/csrf-middleware.ts
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';
import { APIError, ErrorSeverity } from './error-middleware';
import { Security } from '../utils/security';

/**
 * CSRF token store
 */
const csrfTokens = new Map<string, { token: string, expires: number }>();

/**
 * CSRF middleware options
 */
export interface CSRFMiddlewareOptions {
  /**
   * Cookie name for the CSRF token
   */
  cookieName?: string;
  
  /**
   * Header name for the CSRF token
   */
  headerName?: string;
  
  /**
   * Token expiration time in seconds
   */
  tokenExpiration?: number;
  
  /**
   * Whether to enable secure cookies
   */
  secureCookies?: boolean;
  
  /**
   * Whether to enable same-site cookies
   */
  sameSiteCookies?: boolean | 'strict' | 'lax' | 'none';
  
  /**
   * Methods that require CSRF protection
   */
  protectedMethods?: string[];
  
  /**
   * Paths that are exempt from CSRF protection
   */
  ignorePaths?: string[];
}

/**
 * Create CSRF middleware
 * @param options CSRF middleware options
 * @returns CSRF middleware
 */
export function createCSRFMiddleware(options: CSRFMiddlewareOptions = {}) {
  const {
    cookieName = 'XSRF-TOKEN',
    headerName = 'X-XSRF-TOKEN',
    tokenExpiration = 3600, // 1 hour
    secureCookies = process.env.NODE_ENV === 'production',
    sameSiteCookies = 'lax',
    protectedMethods = ['POST', 'PUT', 'PATCH', 'DELETE'],
    ignorePaths = ['/api/v1/auth/login', '/api/v1/auth/logout'],
  } = options;
  
  // Clean up expired tokens every hour
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of csrfTokens.entries()) {
      if (value.expires < now) {
        csrfTokens.delete(key);
      }
    }
  }, 60 * 60 * 1000); // 1 hour
  
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip CSRF protection for ignored paths
    if (ignorePaths.some(path => req.path.startsWith(path))) {
      return next();
    }
    
    // Generate a new CSRF token for GET requests
    if (req.method === 'GET') {
      const token = randomUUID();
      const sessionId = req.session?.id;
      
      if (sessionId) {
        // Store the token with expiration
        csrfTokens.set(sessionId, {
          token,
          expires: Date.now() + tokenExpiration * 1000,
        });
        
        // Set the token in a cookie
        res.cookie(cookieName, token, {
          httpOnly: false, // Client-side JavaScript needs to read this
          secure: secureCookies,
          sameSite: sameSiteCookies,
          maxAge: tokenExpiration * 1000,
        });
      }
      
      return next();
    }
    
    // Check CSRF token for protected methods
    if (protectedMethods.includes(req.method)) {
      const sessionId = req.session?.id;
      
      if (!sessionId) {
        return next(new APIError(
          'Session ID is required for CSRF protection',
          403,
          'CSRF_SESSION_REQUIRED',
          ErrorSeverity.MEDIUM
        ));
      }
      
      // Get the token from the request header
      const requestToken = req.headers[headerName.toLowerCase()] as string;
      
      if (!requestToken) {
        return next(new APIError(
          'CSRF token is required',
          403,
          'CSRF_TOKEN_REQUIRED',
          ErrorSeverity.MEDIUM
        ));
      }
      
      // Get the stored token
      const storedToken = csrfTokens.get(sessionId);
      
      if (!storedToken) {
        return next(new APIError(
          'CSRF token not found',
          403,
          'CSRF_TOKEN_NOT_FOUND',
          ErrorSeverity.MEDIUM
        ));
      }
      
      // Check if the token has expired
      if (storedToken.expires < Date.now()) {
        csrfTokens.delete(sessionId);
        return next(new APIError(
          'CSRF token has expired',
          403,
          'CSRF_TOKEN_EXPIRED',
          ErrorSeverity.MEDIUM
        ));
      }
      
      // Verify the token
      if (!Security.constantTimeCompare(requestToken, storedToken.token)) {
        return next(new APIError(
          'Invalid CSRF token',
          403,
          'CSRF_TOKEN_INVALID',
          ErrorSeverity.MEDIUM
        ));
      }
    }
    
    // Continue to the next middleware
    next();
  };
}
