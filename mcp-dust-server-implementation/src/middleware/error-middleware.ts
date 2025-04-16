// src/middleware/error-middleware.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';

/**
 * Error severity level
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Custom error class for API errors
 */
export class APIError extends Error {
  /**
   * HTTP status code
   */
  statusCode: number;

  /**
   * Error code
   */
  code: string;

  /**
   * Error ID for tracking
   */
  errorId: string;

  /**
   * Error severity level
   */
  severity: ErrorSeverity;

  /**
   * Additional error details
   */
  details?: Record<string, any>;

  /**
   * Create a new APIError
   * @param message Error message
   * @param statusCode HTTP status code
   * @param code Error code
   * @param severity Error severity level
   * @param details Additional error details
   */
  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_SERVER_ERROR',
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    details?: Record<string, any>
  ) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.code = code;
    this.errorId = randomUUID();
    this.severity = severity;
    this.details = details;
  }

  /**
   * Create a validation error
   * @param message Error message
   * @param details Validation details
   * @returns Validation error
   */
  static validationError(message: string, details?: Record<string, any>): APIError {
    return new APIError(message, 400, 'VALIDATION_ERROR', ErrorSeverity.LOW, details);
  }

  /**
   * Create an authentication error
   * @param message Error message
   * @param details Authentication details
   * @returns Authentication error
   */
  static authenticationError(message: string, details?: Record<string, any>): APIError {
    return new APIError(message, 401, 'AUTHENTICATION_ERROR', ErrorSeverity.MEDIUM, details);
  }

  /**
   * Create an authorization error
   * @param message Error message
   * @param details Authorization details
   * @returns Authorization error
   */
  static authorizationError(message: string, details?: Record<string, any>): APIError {
    return new APIError(message, 403, 'AUTHORIZATION_ERROR', ErrorSeverity.MEDIUM, details);
  }

  /**
   * Create a not found error
   * @param message Error message
   * @param details Not found details
   * @returns Not found error
   */
  static notFoundError(message: string, details?: Record<string, any>): APIError {
    return new APIError(message, 404, 'NOT_FOUND', ErrorSeverity.LOW, details);
  }

  /**
   * Create a conflict error
   * @param message Error message
   * @param details Conflict details
   * @returns Conflict error
   */
  static conflictError(message: string, details?: Record<string, any>): APIError {
    return new APIError(message, 409, 'CONFLICT', ErrorSeverity.MEDIUM, details);
  }

  /**
   * Create a rate limit error
   * @param message Error message
   * @param details Rate limit details
   * @returns Rate limit error
   */
  static rateLimitError(message: string, details?: Record<string, any>): APIError {
    return new APIError(message, 429, 'RATE_LIMIT_EXCEEDED', ErrorSeverity.MEDIUM, details);
  }

  /**
   * Create an internal server error
   * @param message Error message
   * @param details Internal server error details
   * @returns Internal server error
   */
  static internalServerError(message: string, details?: Record<string, any>): APIError {
    return new APIError(message, 500, 'INTERNAL_SERVER_ERROR', ErrorSeverity.HIGH, details);
  }

  /**
   * Create a service unavailable error
   * @param message Error message
   * @param details Service unavailable details
   * @returns Service unavailable error
   */
  static serviceUnavailableError(message: string, details?: Record<string, any>): APIError {
    return new APIError(message, 503, 'SERVICE_UNAVAILABLE', ErrorSeverity.HIGH, details);
  }
}

/**
 * Not found middleware
 * @param req Request
 * @param res Response
 * @param next Next function
 */
export function notFoundMiddleware(req: Request, res: Response, next: NextFunction) {
  const error = APIError.notFoundError(`Not found: ${req.method} ${req.path}`, {
    path: req.path,
    method: req.method,
    query: req.query,
  });
  next(error);
}

/**
 * Error handling middleware
 * @param err Error
 * @param req Request
 * @param res Response
 * @param next Next function
 */
export function errorHandlerMiddleware(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Default error values
  let statusCode = 500;
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let message = 'Internal server error';
  let errorId = randomUUID();
  let severity = ErrorSeverity.HIGH;
  let details: Record<string, any> | undefined;

  // If this is an APIError, use its values
  if (err instanceof APIError) {
    statusCode = err.statusCode;
    errorCode = err.code;
    message = err.message;
    errorId = err.errorId;
    severity = err.severity;
    details = err.details;
  } else {
    // For other errors, use generic message in production
    message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
  }

  // Get request logger if available, or use default logger
  const requestLogger = req.logger || logger;

  // Prepare error data for logging
  const errorData = {
    errorId,
    statusCode,
    errorCode,
    severity,
    path: req.path,
    method: req.method,
    requestId: req.headers['x-request-id'],
    sessionId: req.session?.id,
    userId: req.user?.id,
    workspaceId: req.params?.workspaceId,
    details,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
  };

  // Log the error with appropriate severity level
  switch (severity) {
    case ErrorSeverity.LOW:
      requestLogger.warn(`Error: ${statusCode} ${errorCode} - ${err.message}`, errorData);
      break;
    case ErrorSeverity.CRITICAL:
      requestLogger.fatal(`Error: ${statusCode} ${errorCode} - ${err.message}`, errorData);
      break;
    case ErrorSeverity.HIGH:
    case ErrorSeverity.MEDIUM:
    default:
      requestLogger.error(`Error: ${statusCode} ${errorCode} - ${err.message}`, errorData);
      break;
  }

  // Send error response
  res.status(statusCode).json({
    error: {
      code: errorCode,
      message,
      errorId,
      ...(details && Object.keys(details).length > 0 ? { details } : {}),
      ...(process.env.NODE_ENV !== 'production' && err.stack ? { stack: err.stack } : {}),
    },
  });
}

/**
 * JSON-RPC error middleware
 * @param err Error
 * @param req Request
 * @param res Response
 * @param next Next function
 */
export function jsonRpcErrorMiddleware(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Check if this is a JSON-RPC request
  if (req.body && req.body.jsonrpc === '2.0' && req.body.id !== undefined) {
    // Default error values
    let code = -32603; // Internal error
    let message = 'Internal server error';
    let errorId = randomUUID();
    let severity = ErrorSeverity.HIGH;
    let details: Record<string, any> | undefined;

    // Map HTTP errors to JSON-RPC errors
    if (err instanceof APIError) {
      switch (err.statusCode) {
        case 400:
          code = -32600; // Invalid request
          break;
        case 401:
        case 403:
          code = -32001; // Unauthorized
          break;
        case 404:
          code = -32601; // Method not found
          break;
        case 422:
          code = -32602; // Invalid params
          break;
        default:
          code = -32603; // Internal error
      }
      message = err.message;
      errorId = err.errorId;
      severity = err.severity;
      details = err.details;
    } else {
      // For other errors, use generic message in production
      message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
    }

    // Get request logger if available, or use default logger
    const requestLogger = req.logger || logger;

    // Prepare error data for logging
    const errorData = {
      errorId,
      code,
      severity,
      path: req.path,
      method: req.method,
      requestId: req.headers['x-request-id'],
      sessionId: req.session?.id,
      userId: req.user?.id,
      workspaceId: req.params?.workspaceId,
      rpcMethod: req.body.method,
      rpcId: req.body.id,
      rpcParams: req.body.params,
      details,
      stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    };

    // Log the error with appropriate severity level
    switch (severity) {
      case ErrorSeverity.LOW:
        requestLogger.warn(`JSON-RPC Error: ${code} - ${err.message}`, errorData);
        break;
      case ErrorSeverity.CRITICAL:
        requestLogger.fatal(`JSON-RPC Error: ${code} - ${err.message}`, errorData);
        break;
      case ErrorSeverity.HIGH:
      case ErrorSeverity.MEDIUM:
      default:
        requestLogger.error(`JSON-RPC Error: ${code} - ${err.message}`, errorData);
        break;
    }

    // Send JSON-RPC error response
    return res.status(200).json({
      jsonrpc: '2.0',
      error: {
        code,
        message,
        errorId,
        data: {
          ...(details && Object.keys(details).length > 0 ? { details } : {}),
          ...(process.env.NODE_ENV !== 'production' ? { stack: err.stack } : {}),
        },
      },
      id: req.body.id,
    });
  }

  // If not a JSON-RPC request, pass to the next error handler
  next(err);
}
