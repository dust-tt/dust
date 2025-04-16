// tests/unit/middleware/csrf-middleware.test.ts
import { createCSRFMiddleware } from '../../../src/middleware/csrf-middleware';
import { Request, Response, NextFunction } from 'express';
import { mock } from 'jest-mock-extended';

describe('CSRF Middleware', () => {
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
    req.session = {
      id: 'test-session-id',
      cookie: {},
      regenerate: jest.fn(),
      destroy: jest.fn(),
      reload: jest.fn(),
      save: jest.fn(),
      touch: jest.fn(),
    };
    
    // Set up response methods
    res.cookie.mockImplementation(() => res);
  });

  describe('createCSRFMiddleware', () => {
    it('should create a middleware function', () => {
      // Create middleware
      const middleware = createCSRFMiddleware();
      
      // Verify the middleware
      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });
  });

  describe('middleware function', () => {
    it('should generate a CSRF token for GET requests', () => {
      // Create middleware
      const middleware = createCSRFMiddleware();
      
      // Call the middleware
      middleware(req, res, next);
      
      // Verify the response
      expect(res.cookie).toHaveBeenCalledWith(
        'XSRF-TOKEN',
        expect.any(String),
        expect.objectContaining({
          httpOnly: false,
          maxAge: 3600 * 1000,
        })
      );
      
      // Verify next was called
      expect(next).toHaveBeenCalled();
    });

    it('should validate the CSRF token for POST requests', () => {
      // Create middleware
      const middleware = createCSRFMiddleware();
      
      // Set up request for token generation
      req.method = 'GET';
      
      // Call the middleware to generate a token
      middleware(req, res, next);
      
      // Get the generated token
      const token = res.cookie.mock.calls[0][1];
      
      // Set up request for token validation
      req.method = 'POST';
      req.headers = {
        'x-xsrf-token': token,
      };
      
      // Reset next
      next.mockReset();
      
      // Call the middleware again
      middleware(req, res, next);
      
      // Verify next was called
      expect(next).toHaveBeenCalled();
    });

    it('should reject POST requests without a CSRF token', () => {
      // Create middleware
      const middleware = createCSRFMiddleware();
      
      // Set up request
      req.method = 'POST';
      
      // Call the middleware
      middleware(req, res, next);
      
      // Verify next was called with an error
      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 403,
        code: 'CSRF_TOKEN_REQUIRED',
      }));
    });

    it('should reject POST requests with an invalid CSRF token', () => {
      // Create middleware
      const middleware = createCSRFMiddleware();
      
      // Set up request for token generation
      req.method = 'GET';
      
      // Call the middleware to generate a token
      middleware(req, res, next);
      
      // Set up request for token validation
      req.method = 'POST';
      req.headers = {
        'x-xsrf-token': 'invalid-token',
      };
      
      // Reset next
      next.mockReset();
      
      // Call the middleware again
      middleware(req, res, next);
      
      // Verify next was called with an error
      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 403,
        code: 'CSRF_TOKEN_INVALID',
      }));
    });

    it('should skip CSRF protection for ignored paths', () => {
      // Create middleware
      const middleware = createCSRFMiddleware({
        ignorePaths: ['/api/v1/auth/login'],
      });
      
      // Set up request
      req.method = 'POST';
      req.path = '/api/v1/auth/login';
      
      // Call the middleware
      middleware(req, res, next);
      
      // Verify next was called without an error
      expect(next).toHaveBeenCalledWith();
    });

    it('should only protect specified methods', () => {
      // Create middleware
      const middleware = createCSRFMiddleware({
        protectedMethods: ['POST', 'PUT'],
      });
      
      // Set up request
      req.method = 'DELETE';
      
      // Call the middleware
      middleware(req, res, next);
      
      // Verify next was called without an error
      expect(next).toHaveBeenCalledWith();
    });

    it('should use custom cookie and header names', () => {
      // Create middleware
      const middleware = createCSRFMiddleware({
        cookieName: 'CUSTOM-CSRF-TOKEN',
        headerName: 'X-CUSTOM-CSRF-TOKEN',
      });
      
      // Set up request for token generation
      req.method = 'GET';
      
      // Call the middleware to generate a token
      middleware(req, res, next);
      
      // Verify the response
      expect(res.cookie).toHaveBeenCalledWith(
        'CUSTOM-CSRF-TOKEN',
        expect.any(String),
        expect.any(Object)
      );
      
      // Get the generated token
      const token = res.cookie.mock.calls[0][1];
      
      // Set up request for token validation
      req.method = 'POST';
      req.headers = {
        'x-custom-csrf-token': token,
      };
      
      // Reset next
      next.mockReset();
      
      // Call the middleware again
      middleware(req, res, next);
      
      // Verify next was called
      expect(next).toHaveBeenCalled();
    });

    it('should expire tokens after the specified time', () => {
      // Create middleware with a short expiration time
      const middleware = createCSRFMiddleware({
        tokenExpiration: 1, // 1 second
      });
      
      // Set up request for token generation
      req.method = 'GET';
      
      // Call the middleware to generate a token
      middleware(req, res, next);
      
      // Get the generated token
      const token = res.cookie.mock.calls[0][1];
      
      // Set up request for token validation
      req.method = 'POST';
      req.headers = {
        'x-xsrf-token': token,
      };
      
      // Reset next
      next.mockReset();
      
      // Advance time by 2 seconds
      jest.advanceTimersByTime(2000);
      
      // Call the middleware again
      middleware(req, res, next);
      
      // Verify next was called with an error
      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 403,
        code: 'CSRF_TOKEN_EXPIRED',
      }));
    });
  });
});
