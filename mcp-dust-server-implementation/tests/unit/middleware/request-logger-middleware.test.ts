// tests/unit/middleware/request-logger-middleware.test.ts
import { createRequestLoggerMiddleware } from '../../../src/middleware/request-logger-middleware';
import { Request, Response, NextFunction } from 'express';
import { mock } from 'jest-mock-extended';
import { logger } from '../../../src/utils/logger';

// Mock the logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Request Logger Middleware', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    // Create mock request, response, and next function
    req = mock<Request>();
    res = mock<Response>();
    next = jest.fn();
    
    // Set up request properties
    req.method = 'GET';
    req.path = '/api/v1/test';
    req.ip = '127.0.0.1';
    req.headers = {
      'user-agent': 'test-user-agent',
    };
    
    // Set up response methods
    res.on = jest.fn().mockImplementation((event, callback) => {
      if (event === 'finish') {
        callback();
      }
      return res;
    });
    
    // Reset the logger mocks
    (logger.info as jest.Mock).mockClear();
    (logger.debug as jest.Mock).mockClear();
    (logger.error as jest.Mock).mockClear();
  });

  describe('createRequestLoggerMiddleware', () => {
    it('should create a middleware function', () => {
      // Create middleware
      const middleware = createRequestLoggerMiddleware();
      
      // Verify the middleware
      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });
  });

  describe('middleware function', () => {
    it('should log requests and responses', () => {
      // Create middleware
      const middleware = createRequestLoggerMiddleware();
      
      // Call the middleware
      middleware(req, res, next);
      
      // Verify next was called
      expect(next).toHaveBeenCalled();
      
      // Verify the request was logged
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Request'),
        expect.objectContaining({
          method: 'GET',
          path: '/api/v1/test',
          ip: '127.0.0.1',
        })
      );
      
      // Simulate response finish
      res.statusCode = 200;
      res.on.mock.calls[0][1]();
      
      // Verify the response was logged
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Response'),
        expect.objectContaining({
          method: 'GET',
          path: '/api/v1/test',
          statusCode: 200,
        })
      );
    });

    it('should log request body if enabled', () => {
      // Create middleware with request body logging enabled
      const middleware = createRequestLoggerMiddleware({
        logRequestBody: true,
      });
      
      // Set up request body
      req.body = {
        test: 'value',
      };
      
      // Call the middleware
      middleware(req, res, next);
      
      // Verify the request was logged with body
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Request'),
        expect.objectContaining({
          body: {
            test: 'value',
          },
        })
      );
    });

    it('should log request headers if enabled', () => {
      // Create middleware with request headers logging enabled
      const middleware = createRequestLoggerMiddleware({
        logRequestHeaders: true,
      });
      
      // Call the middleware
      middleware(req, res, next);
      
      // Verify the request was logged with headers
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Request'),
        expect.objectContaining({
          headers: {
            'user-agent': 'test-user-agent',
          },
        })
      );
    });

    it('should log response body if enabled', () => {
      // Create middleware with response body logging enabled
      const middleware = createRequestLoggerMiddleware({
        logResponseBody: true,
      });
      
      // Call the middleware
      middleware(req, res, next);
      
      // Set up response body
      const originalWrite = res.write;
      const originalEnd = res.end;
      
      // Mock response.write and response.end
      res.write = jest.fn().mockImplementation(function(chunk) {
        (this as any)._responseBody = chunk.toString();
        return true;
      });
      
      res.end = jest.fn().mockImplementation(function(chunk) {
        if (chunk) {
          (this as any)._responseBody = chunk.toString();
        }
        return true;
      });
      
      // Simulate response body
      res.write(Buffer.from('{"test":"value"}'));
      
      // Simulate response finish
      res.statusCode = 200;
      res.on.mock.calls[0][1]();
      
      // Verify the response was logged with body
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Response'),
        expect.objectContaining({
          body: '{"test":"value"}',
        })
      );
      
      // Restore original methods
      res.write = originalWrite;
      res.end = originalEnd;
    });

    it('should log response headers if enabled', () => {
      // Create middleware with response headers logging enabled
      const middleware = createRequestLoggerMiddleware({
        logResponseHeaders: true,
      });
      
      // Call the middleware
      middleware(req, res, next);
      
      // Set up response headers
      res.getHeaders = jest.fn().mockReturnValue({
        'content-type': 'application/json',
      });
      
      // Simulate response finish
      res.statusCode = 200;
      res.on.mock.calls[0][1]();
      
      // Verify the response was logged with headers
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Response'),
        expect.objectContaining({
          headers: {
            'content-type': 'application/json',
          },
        })
      );
    });

    it('should log errors', () => {
      // Create middleware
      const middleware = createRequestLoggerMiddleware();
      
      // Call the middleware
      middleware(req, res, next);
      
      // Simulate an error
      const error = new Error('Test error');
      next(error);
      
      // Verify the error was logged
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Request error'),
        expect.objectContaining({
          error: error.message,
          stack: error.stack,
        })
      );
    });

    it('should mask sensitive data in request body', () => {
      // Create middleware with request body logging enabled
      const middleware = createRequestLoggerMiddleware({
        logRequestBody: true,
      });
      
      // Set up request body with sensitive data
      req.body = {
        username: 'test-user',
        password: 'test-password',
        apiKey: 'test-api-key',
        token: 'test-token',
      };
      
      // Call the middleware
      middleware(req, res, next);
      
      // Verify the request was logged with masked sensitive data
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Request'),
        expect.objectContaining({
          body: {
            username: 'test-user',
            password: '[REDACTED]',
            apiKey: '[REDACTED]',
            token: '[REDACTED]',
          },
        })
      );
    });

    it('should exclude specified paths from logging', () => {
      // Create middleware with excluded paths
      const middleware = createRequestLoggerMiddleware({
        excludedPaths: ['/health', '/ready'],
      });
      
      // Set up request path
      req.path = '/health';
      
      // Call the middleware
      middleware(req, res, next);
      
      // Verify next was called
      expect(next).toHaveBeenCalled();
      
      // Verify the request was not logged
      expect(logger.info).not.toHaveBeenCalled();
    });
  });
});
