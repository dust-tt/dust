// tests/unit/middleware/rate-limit-middleware.test.ts
import { createRateLimitMiddleware } from '../../../src/middleware/rate-limit-middleware';
import { Request, Response, NextFunction } from 'express';
import { mock } from 'jest-mock-extended';

describe('Rate Limit Middleware', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    // Create mock request, response, and next function
    req = mock<Request>();
    res = mock<Response>();
    next = jest.fn();
    
    // Set up request properties
    req.ip = '127.0.0.1';
    
    // Set up response methods
    res.setHeader.mockImplementation(() => res);
  });

  describe('createRateLimitMiddleware', () => {
    it('should create a middleware function', () => {
      // Create middleware
      const middleware = createRateLimitMiddleware();
      
      // Verify the middleware
      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });
  });

  describe('middleware function', () => {
    it('should allow requests within the rate limit', () => {
      // Create middleware with a high limit
      const middleware = createRateLimitMiddleware({
        limit: 100,
        windowSizeInSeconds: 60,
      });
      
      // Call the middleware
      middleware(req, res, next);
      
      // Verify the response
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '99');
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
      
      // Verify next was called
      expect(next).toHaveBeenCalled();
    });

    it('should block requests that exceed the rate limit', () => {
      // Create middleware with a low limit
      const middleware = createRateLimitMiddleware({
        limit: 1,
        windowSizeInSeconds: 60,
      });
      
      // Call the middleware twice
      middleware(req, res, next);
      middleware(req, res, next);
      
      // Verify the response
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '1');
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
      
      // Verify next was called with an error
      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 429,
        code: 'RATE_LIMIT_EXCEEDED',
      }));
    });

    it('should skip rate limiting for specified requests', () => {
      // Create middleware with a low limit and a skip function
      const middleware = createRateLimitMiddleware({
        limit: 1,
        windowSizeInSeconds: 60,
        skip: (req) => req.path === '/health',
      });
      
      // Set up request path
      req.path = '/health';
      
      // Call the middleware twice
      middleware(req, res, next);
      middleware(req, res, next);
      
      // Verify next was called without an error
      expect(next).toHaveBeenCalledTimes(2);
      expect(next).toHaveBeenCalledWith();
    });

    it('should use a custom key generator', () => {
      // Create middleware with a custom key generator
      const middleware = createRateLimitMiddleware({
        limit: 1,
        windowSizeInSeconds: 60,
        keyGenerator: (req) => req.headers['x-forwarded-for'] as string || req.ip || 'unknown',
      });
      
      // Set up request headers
      req.headers = {
        'x-forwarded-for': '192.168.1.1',
      };
      
      // Call the middleware
      middleware(req, res, next);
      
      // Verify next was called
      expect(next).toHaveBeenCalled();
      
      // Change the IP but keep the X-Forwarded-For header
      req.ip = '127.0.0.2';
      
      // Call the middleware again
      middleware(req, res, next);
      
      // Verify next was called with an error (rate limit exceeded)
      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 429,
        code: 'RATE_LIMIT_EXCEEDED',
      }));
    });

    it('should use custom message and status code', () => {
      // Create middleware with custom message and status code
      const middleware = createRateLimitMiddleware({
        limit: 1,
        windowSizeInSeconds: 60,
        message: 'Custom rate limit message',
        statusCode: 403,
      });
      
      // Call the middleware twice
      middleware(req, res, next);
      middleware(req, res, next);
      
      // Verify next was called with the custom error
      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Custom rate limit message',
        statusCode: 403,
        code: 'RATE_LIMIT_EXCEEDED',
      }));
    });

    it('should reset the rate limit after the window expires', () => {
      // Create middleware with a short window
      const middleware = createRateLimitMiddleware({
        limit: 1,
        windowSizeInSeconds: 1, // 1 second
      });
      
      // Call the middleware
      middleware(req, res, next);
      
      // Verify next was called
      expect(next).toHaveBeenCalledWith();
      
      // Advance time by 2 seconds
      jest.advanceTimersByTime(2000);
      
      // Call the middleware again
      middleware(req, res, next);
      
      // Verify next was called without an error
      expect(next).toHaveBeenCalledWith();
    });
  });
});
