// tests/unit/middleware/error-middleware.test.ts
import { createErrorMiddleware, APIError, ErrorSeverity } from '../../../src/middleware/error-middleware';
import { Request, Response, NextFunction } from 'express';
import { mock } from 'jest-mock-extended';

describe('Error Middleware', () => {
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
    
    // Set up response methods
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
  });

  describe('createErrorMiddleware', () => {
    it('should create a middleware function', () => {
      // Create middleware
      const middleware = createErrorMiddleware();
      
      // Verify the middleware
      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });
  });

  describe('middleware function', () => {
    it('should handle APIError instances', () => {
      // Create middleware
      const middleware = createErrorMiddleware();
      
      // Create an APIError
      const error = new APIError('Test error', 400, 'TEST_ERROR', ErrorSeverity.LOW);
      
      // Call the middleware
      middleware(error, req, res, next);
      
      // Verify the response
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          message: 'Test error',
          code: 'TEST_ERROR',
          severity: 'LOW',
        }),
      }));
    });

    it('should handle regular Error instances', () => {
      // Create middleware
      const middleware = createErrorMiddleware();
      
      // Create a regular Error
      const error = new Error('Test error');
      
      // Call the middleware
      middleware(error, req, res, next);
      
      // Verify the response
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          message: 'Test error',
          code: 'INTERNAL_SERVER_ERROR',
          severity: 'HIGH',
        }),
      }));
    });

    it('should handle non-Error objects', () => {
      // Create middleware
      const middleware = createErrorMiddleware();
      
      // Create a non-Error object
      const error = { message: 'Test error' };
      
      // Call the middleware
      middleware(error, req, res, next);
      
      // Verify the response
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          message: 'Unknown error',
          code: 'INTERNAL_SERVER_ERROR',
          severity: 'HIGH',
        }),
      }));
    });

    it('should include request information in development mode', () => {
      // Save the original NODE_ENV
      const originalNodeEnv = process.env.NODE_ENV;
      
      // Set NODE_ENV to development
      process.env.NODE_ENV = 'development';
      
      // Create middleware
      const middleware = createErrorMiddleware();
      
      // Create an APIError
      const error = new APIError('Test error', 400, 'TEST_ERROR', ErrorSeverity.LOW);
      
      // Call the middleware
      middleware(error, req, res, next);
      
      // Verify the response
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          request: expect.objectContaining({
            method: 'GET',
            path: '/api/v1/test',
          }),
        }),
      }));
      
      // Restore the original NODE_ENV
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should not include request information in production mode', () => {
      // Save the original NODE_ENV
      const originalNodeEnv = process.env.NODE_ENV;
      
      // Set NODE_ENV to production
      process.env.NODE_ENV = 'production';
      
      // Create middleware
      const middleware = createErrorMiddleware();
      
      // Create an APIError
      const error = new APIError('Test error', 400, 'TEST_ERROR', ErrorSeverity.LOW);
      
      // Call the middleware
      middleware(error, req, res, next);
      
      // Verify the response
      expect(res.json).toHaveBeenCalledWith(expect.not.objectContaining({
        error: expect.objectContaining({
          request: expect.any(Object),
        }),
      }));
      
      // Restore the original NODE_ENV
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should include stack trace in development mode', () => {
      // Save the original NODE_ENV
      const originalNodeEnv = process.env.NODE_ENV;
      
      // Set NODE_ENV to development
      process.env.NODE_ENV = 'development';
      
      // Create middleware
      const middleware = createErrorMiddleware();
      
      // Create an APIError
      const error = new APIError('Test error', 400, 'TEST_ERROR', ErrorSeverity.LOW);
      
      // Call the middleware
      middleware(error, req, res, next);
      
      // Verify the response
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          stack: expect.any(String),
        }),
      }));
      
      // Restore the original NODE_ENV
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should not include stack trace in production mode', () => {
      // Save the original NODE_ENV
      const originalNodeEnv = process.env.NODE_ENV;
      
      // Set NODE_ENV to production
      process.env.NODE_ENV = 'production';
      
      // Create middleware
      const middleware = createErrorMiddleware();
      
      // Create an APIError
      const error = new APIError('Test error', 400, 'TEST_ERROR', ErrorSeverity.LOW);
      
      // Call the middleware
      middleware(error, req, res, next);
      
      // Verify the response
      expect(res.json).toHaveBeenCalledWith(expect.not.objectContaining({
        error: expect.objectContaining({
          stack: expect.any(String),
        }),
      }));
      
      // Restore the original NODE_ENV
      process.env.NODE_ENV = originalNodeEnv;
    });
  });

  describe('APIError', () => {
    it('should create an APIError instance', () => {
      // Create an APIError
      const error = new APIError('Test error', 400, 'TEST_ERROR', ErrorSeverity.LOW);
      
      // Verify the error
      expect(error).toBeInstanceOf(APIError);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('TEST_ERROR');
      expect(error.severity).toBe(ErrorSeverity.LOW);
    });

    it('should create an APIError with default values', () => {
      // Create an APIError with minimal parameters
      const error = new APIError('Test error');
      
      // Verify the error
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(error.severity).toBe(ErrorSeverity.HIGH);
    });

    it('should include additional data', () => {
      // Create an APIError with additional data
      const error = new APIError('Test error', 400, 'TEST_ERROR', ErrorSeverity.LOW, {
        field: 'test',
        value: 123,
      });
      
      // Verify the error
      expect(error.data).toEqual({
        field: 'test',
        value: 123,
      });
    });

    it('should provide static factory methods', () => {
      // Create errors using factory methods
      const validationError = APIError.validationError('Validation error');
      const authenticationError = APIError.authenticationError('Authentication error');
      const authorizationError = APIError.authorizationError('Authorization error');
      const notFoundError = APIError.notFoundError('Not found error');
      const serverError = APIError.serverError('Server error');
      
      // Verify the errors
      expect(validationError.statusCode).toBe(400);
      expect(validationError.code).toBe('VALIDATION_ERROR');
      
      expect(authenticationError.statusCode).toBe(401);
      expect(authenticationError.code).toBe('AUTHENTICATION_ERROR');
      
      expect(authorizationError.statusCode).toBe(403);
      expect(authorizationError.code).toBe('AUTHORIZATION_ERROR');
      
      expect(notFoundError.statusCode).toBe(404);
      expect(notFoundError.code).toBe('NOT_FOUND');
      
      expect(serverError.statusCode).toBe(500);
      expect(serverError.code).toBe('INTERNAL_SERVER_ERROR');
    });
  });
});
