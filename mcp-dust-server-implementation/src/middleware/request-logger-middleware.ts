// src/middleware/request-logger-middleware.ts
import { Request, Response, NextFunction } from 'express';
import { logger, Logger } from '../utils/logger';
import { randomUUID } from 'crypto';

/**
 * Request logger middleware options
 */
export interface RequestLoggerMiddlewareOptions {
  /**
   * Whether to log request body
   */
  logBody?: boolean;
  
  /**
   * Whether to log request headers
   */
  logHeaders?: boolean;
  
  /**
   * Whether to log response body
   */
  logResponseBody?: boolean;
  
  /**
   * Whether to log response headers
   */
  logResponseHeaders?: boolean;
  
  /**
   * Whether to log request and response times
   */
  logTiming?: boolean;
  
  /**
   * Headers to redact from logs
   */
  redactHeaders?: string[];
  
  /**
   * Body fields to redact from logs
   */
  redactBodyFields?: string[];
}

/**
 * Create request logger middleware
 * @param options Request logger middleware options
 * @returns Request logger middleware
 */
export function createRequestLoggerMiddleware(options: RequestLoggerMiddlewareOptions = {}) {
  const {
    logBody = false,
    logHeaders = false,
    logResponseBody = false,
    logResponseHeaders = false,
    logTiming = true,
    redactHeaders = ['authorization', 'cookie', 'x-api-key'],
    redactBodyFields = ['password', 'token', 'apiKey', 'secret'],
  } = options;
  
  return (req: Request, res: Response, next: NextFunction) => {
    // Generate request ID if not present
    const requestId = req.headers['x-request-id'] as string || randomUUID();
    req.headers['x-request-id'] = requestId;
    
    // Create request-specific logger
    const requestLogger = logger.createRequestLogger(req);
    
    // Store logger in request for use in other middleware and routes
    req.logger = requestLogger;
    
    // Log request start
    const startTime = Date.now();
    
    // Prepare request data for logging
    const requestData: Record<string, any> = {
      requestId,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    };
    
    // Add headers if enabled
    if (logHeaders) {
      const headers = { ...req.headers };
      
      // Redact sensitive headers
      for (const header of redactHeaders) {
        if (headers[header]) {
          headers[header] = '[REDACTED]';
        }
      }
      
      requestData.headers = headers;
    }
    
    // Add body if enabled
    if (logBody && req.body) {
      const body = { ...req.body };
      
      // Redact sensitive body fields
      for (const field of redactBodyFields) {
        if (body[field]) {
          body[field] = '[REDACTED]';
        }
      }
      
      requestData.body = body;
    }
    
    // Log request
    requestLogger.info('Request received', requestData);
    
    // Capture original response methods
    const originalSend = res.send;
    const originalJson = res.json;
    const originalEnd = res.end;
    
    // Override response methods to capture response data
    if (logResponseBody) {
      res.send = function (body: any): Response {
        res.locals.responseBody = body;
        return originalSend.apply(res, [body]);
      };
      
      res.json = function (body: any): Response {
        res.locals.responseBody = body;
        return originalJson.apply(res, [body]);
      };
    }
    
    // Log response when it's sent
    res.end = function (chunk: any, encoding: BufferEncoding, callback?: () => void): Response {
      // Calculate response time
      const responseTime = Date.now() - startTime;
      
      // Prepare response data for logging
      const responseData: Record<string, any> = {
        requestId,
        statusCode: res.statusCode,
        statusMessage: res.statusMessage,
      };
      
      // Add timing if enabled
      if (logTiming) {
        responseData.responseTime = responseTime;
      }
      
      // Add headers if enabled
      if (logResponseHeaders) {
        responseData.headers = res.getHeaders();
      }
      
      // Add body if enabled and available
      if (logResponseBody && res.locals.responseBody) {
        responseData.body = res.locals.responseBody;
      }
      
      // Log response
      if (res.statusCode >= 500) {
        requestLogger.error('Response sent', responseData);
      } else if (res.statusCode >= 400) {
        requestLogger.warn('Response sent', responseData);
      } else {
        requestLogger.info('Response sent', responseData);
      }
      
      // Call original end method
      return originalEnd.apply(res, [chunk, encoding, callback]);
    };
    
    next();
  };
}

// Extend Express Request interface to include logger
declare global {
  namespace Express {
    interface Request {
      logger: Logger;
    }
  }
}
