// src/middleware/rate-limit-middleware.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { APIError, ErrorSeverity } from './error-middleware';

/**
 * Rate limit entry
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
  lastRequest: number;
}

/**
 * Rate limit options
 */
export interface RateLimitOptions {
  /**
   * Maximum number of requests allowed in the window
   */
  limit: number;
  
  /**
   * Window size in seconds
   */
  windowSizeInSeconds: number;
  
  /**
   * Whether to include headers in the response
   */
  includeHeaders: boolean;
  
  /**
   * Function to get the key from the request
   */
  keyGenerator: (req: Request) => string;
  
  /**
   * Skip rate limiting for certain requests
   */
  skip?: (req: Request) => boolean;
  
  /**
   * Message to send when rate limit is exceeded
   */
  message?: string;
  
  /**
   * Status code to send when rate limit is exceeded
   */
  statusCode?: number;
}

/**
 * Create rate limiting middleware
 * @param options Rate limit options
 * @returns Rate limiting middleware
 */
export function createRateLimitMiddleware(options: Partial<RateLimitOptions> = {}) {
  const {
    limit = 100,
    windowSizeInSeconds = 60 * 60, // 1 hour
    includeHeaders = true,
    keyGenerator = (req: Request) => req.ip || 'unknown',
    skip = () => false,
    message = 'Too many requests, please try again later',
    statusCode = 429,
  } = options;
  
  // Store rate limit entries in memory
  const rateLimitStore = new Map<string, RateLimitEntry>();
  
  // Clean up expired entries every hour
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (entry.resetTime < now) {
        rateLimitStore.delete(key);
      }
    }
  }, 60 * 60 * 1000); // 1 hour
  
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip rate limiting if specified
    if (skip(req)) {
      return next();
    }
    
    // Get the key for this request
    const key = keyGenerator(req);
    
    // Get the current time
    const now = Date.now();
    
    // Get or create the rate limit entry
    let entry = rateLimitStore.get(key);
    if (!entry) {
      entry = {
        count: 0,
        resetTime: now + windowSizeInSeconds * 1000,
        lastRequest: now,
      };
      rateLimitStore.set(key, entry);
    }
    
    // Reset the count if the window has expired
    if (entry.resetTime < now) {
      entry.count = 0;
      entry.resetTime = now + windowSizeInSeconds * 1000;
    }
    
    // Increment the count
    entry.count++;
    entry.lastRequest = now;
    
    // Calculate remaining requests
    const remaining = Math.max(0, limit - entry.count);
    
    // Add rate limit headers
    if (includeHeaders) {
      res.setHeader('X-RateLimit-Limit', limit.toString());
      res.setHeader('X-RateLimit-Remaining', remaining.toString());
      res.setHeader('X-RateLimit-Reset', Math.floor(entry.resetTime / 1000).toString());
    }
    
    // Check if the rate limit has been exceeded
    if (entry.count > limit) {
      // Log rate limit exceeded
      logger.warn(`Rate limit exceeded for ${key}`, {
        ip: req.ip,
        path: req.path,
        method: req.method,
        limit,
        count: entry.count,
        resetTime: new Date(entry.resetTime).toISOString(),
      });
      
      // Return rate limit error
      const error = new APIError(
        message,
        statusCode,
        'RATE_LIMIT_EXCEEDED',
        ErrorSeverity.MEDIUM,
        {
          limit,
          remaining: 0,
          resetTime: Math.floor(entry.resetTime / 1000),
        }
      );
      
      return next(error);
    }
    
    // Continue to the next middleware
    next();
  };
}
