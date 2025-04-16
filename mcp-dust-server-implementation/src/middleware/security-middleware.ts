// src/middleware/security-middleware.ts
import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';

/**
 * Security middleware options
 */
export interface SecurityMiddlewareOptions {
  /**
   * Whether to enable HSTS
   */
  enableHSTS?: boolean;
  
  /**
   * Whether to enable CSP
   */
  enableCSP?: boolean;
  
  /**
   * Whether to enable XSS protection
   */
  enableXSSProtection?: boolean;
  
  /**
   * Whether to enable no sniff
   */
  enableNoSniff?: boolean;
  
  /**
   * Whether to enable frame options
   */
  enableFrameOptions?: boolean;
  
  /**
   * Whether to enable referrer policy
   */
  enableReferrerPolicy?: boolean;
  
  /**
   * Whether to enable DNS prefetch control
   */
  enableDNSPrefetchControl?: boolean;
  
  /**
   * Whether to enable permission policy
   */
  enablePermissionPolicy?: boolean;
  
  /**
   * Whether to enable cross-origin opener policy
   */
  enableCrossOriginOpenerPolicy?: boolean;
  
  /**
   * Whether to enable cross-origin embedder policy
   */
  enableCrossOriginEmbedderPolicy?: boolean;
  
  /**
   * Whether to enable cross-origin resource policy
   */
  enableCrossOriginResourcePolicy?: boolean;
  
  /**
   * Whether to enable origin agent cluster
   */
  enableOriginAgentCluster?: boolean;
  
  /**
   * Whether to enable request ID
   */
  enableRequestId?: boolean;
}

/**
 * Create security middleware
 * @param options Security middleware options
 * @returns Security middleware
 */
export function createSecurityMiddleware(options: SecurityMiddlewareOptions = {}) {
  const {
    enableHSTS = true,
    enableCSP = true,
    enableXSSProtection = true,
    enableNoSniff = true,
    enableFrameOptions = true,
    enableReferrerPolicy = true,
    enableDNSPrefetchControl = true,
    enablePermissionPolicy = true,
    enableCrossOriginOpenerPolicy = true,
    enableCrossOriginEmbedderPolicy = false, // Disabled by default as it can break some integrations
    enableCrossOriginResourcePolicy = true,
    enableOriginAgentCluster = true,
    enableRequestId = true,
  } = options;
  
  // Create helmet middleware with specified options
  const helmetMiddleware = helmet({
    contentSecurityPolicy: enableCSP ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    } : false,
    xssFilter: enableXSSProtection,
    noSniff: enableNoSniff,
    frameguard: enableFrameOptions ? { action: 'deny' } : false,
    hsts: enableHSTS ? {
      maxAge: 15552000, // 180 days
      includeSubDomains: true,
      preload: true,
    } : false,
    referrerPolicy: enableReferrerPolicy ? { policy: 'no-referrer' } : false,
    dnsPrefetchControl: enableDNSPrefetchControl,
    permissionPolicy: enablePermissionPolicy ? {
      features: {
        camera: ["'none'"],
        microphone: ["'none'"],
        geolocation: ["'none'"],
      },
    } : false,
    crossOriginOpenerPolicy: enableCrossOriginOpenerPolicy ? { policy: 'same-origin' } : false,
    crossOriginEmbedderPolicy: enableCrossOriginEmbedderPolicy ? { policy: 'require-corp' } : false,
    crossOriginResourcePolicy: enableCrossOriginResourcePolicy ? { policy: 'same-origin' } : false,
    originAgentCluster: enableOriginAgentCluster,
  });
  
  // Create request ID middleware
  const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
    if (enableRequestId) {
      // Generate a request ID if not already present
      const requestId = req.headers['x-request-id'] as string || randomUUID();
      req.headers['x-request-id'] = requestId;
      res.setHeader('X-Request-ID', requestId);
    }
    next();
  };
  
  // Return combined middleware
  return [requestIdMiddleware, helmetMiddleware];
}
