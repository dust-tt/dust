// src/utils/uncaught-handler.ts
import { logger } from './logger';
import { APIError, ErrorSeverity } from '../middleware/error-middleware';

/**
 * Initialize uncaught exception and unhandled rejection handlers
 */
export function initializeUncaughtHandlers(): void {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    const apiError = error instanceof APIError
      ? error
      : new APIError(
          `Uncaught exception: ${error.message}`,
          500,
          'UNCAUGHT_EXCEPTION',
          ErrorSeverity.CRITICAL,
          { stack: error.stack }
        );
    
    logger.fatal('Uncaught exception', {
      errorId: apiError.errorId,
      message: apiError.message,
      stack: apiError.stack,
      details: apiError.details,
    });
    
    // Exit process with error
    process.exit(1);
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    const apiError = reason instanceof APIError
      ? reason
      : new APIError(
          `Unhandled rejection: ${error.message}`,
          500,
          'UNHANDLED_REJECTION',
          ErrorSeverity.HIGH,
          { stack: error.stack }
        );
    
    logger.error('Unhandled promise rejection', {
      errorId: apiError.errorId,
      message: apiError.message,
      stack: apiError.stack,
      details: apiError.details,
      promise,
    });
  });
  
  // Handle SIGTERM signal
  process.on('SIGTERM', () => {
    logger.info('SIGTERM signal received, shutting down gracefully');
    
    // Perform cleanup here if needed
    
    // Exit process
    process.exit(0);
  });
  
  // Handle SIGINT signal
  process.on('SIGINT', () => {
    logger.info('SIGINT signal received, shutting down gracefully');
    
    // Perform cleanup here if needed
    
    // Exit process
    process.exit(0);
  });
  
  logger.info('Uncaught exception and unhandled rejection handlers initialized');
}
