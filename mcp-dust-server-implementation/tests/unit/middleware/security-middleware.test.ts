// tests/unit/middleware/security-middleware.test.ts
import { createSecurityMiddleware } from '../../../src/middleware/security-middleware';
import { Request, Response, NextFunction } from 'express';
import { mock } from 'jest-mock-extended';

describe('Security Middleware', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    // Create mock request, response, and next function
    req = mock<Request>();
    res = mock<Response>();
    next = jest.fn();
    
    // Set up response methods
    res.setHeader.mockImplementation(() => res);
  });

  describe('createSecurityMiddleware', () => {
    it('should create an array of middleware functions', () => {
      // Create middleware
      const middleware = createSecurityMiddleware();
      
      // Verify the middleware
      expect(middleware).toBeDefined();
      expect(Array.isArray(middleware)).toBe(true);
      expect(middleware.length).toBeGreaterThan(0);
      expect(typeof middleware[0]).toBe('function');
    });
  });

  describe('request ID middleware', () => {
    it('should add a request ID to the request and response', () => {
      // Create middleware
      const middleware = createSecurityMiddleware({
        enableRequestId: true,
      });
      
      // Get the request ID middleware
      const requestIdMiddleware = middleware[0];
      
      // Call the middleware
      requestIdMiddleware(req, res, next);
      
      // Verify the request and response
      expect(req.headers['x-request-id']).toBeDefined();
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', req.headers['x-request-id']);
      
      // Verify next was called
      expect(next).toHaveBeenCalled();
    });

    it('should use an existing request ID if present', () => {
      // Create middleware
      const middleware = createSecurityMiddleware({
        enableRequestId: true,
      });
      
      // Get the request ID middleware
      const requestIdMiddleware = middleware[0];
      
      // Set up request headers
      req.headers = {
        'x-request-id': 'existing-request-id',
      };
      
      // Call the middleware
      requestIdMiddleware(req, res, next);
      
      // Verify the request and response
      expect(req.headers['x-request-id']).toBe('existing-request-id');
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', 'existing-request-id');
      
      // Verify next was called
      expect(next).toHaveBeenCalled();
    });

    it('should not add a request ID if disabled', () => {
      // Create middleware
      const middleware = createSecurityMiddleware({
        enableRequestId: false,
      });
      
      // Get the request ID middleware
      const requestIdMiddleware = middleware[0];
      
      // Call the middleware
      requestIdMiddleware(req, res, next);
      
      // Verify the request and response
      expect(req.headers['x-request-id']).toBeUndefined();
      expect(res.setHeader).not.toHaveBeenCalledWith('X-Request-ID', expect.any(String));
      
      // Verify next was called
      expect(next).toHaveBeenCalled();
    });
  });

  describe('helmet middleware', () => {
    it('should be included in the middleware array', () => {
      // Create middleware
      const middleware = createSecurityMiddleware();
      
      // Verify the middleware
      expect(middleware.length).toBeGreaterThan(1);
      expect(typeof middleware[1]).toBe('function');
    });
  });

  describe('security options', () => {
    it('should enable HSTS by default', () => {
      // Create middleware
      createSecurityMiddleware();
      
      // Verify helmet was called with HSTS enabled
      expect(require('helmet')).toHaveBeenCalledWith(expect.objectContaining({
        hsts: expect.objectContaining({
          maxAge: 15552000,
          includeSubDomains: true,
          preload: true,
        }),
      }));
    });

    it('should disable HSTS if specified', () => {
      // Create middleware
      createSecurityMiddleware({
        enableHSTS: false,
      });
      
      // Verify helmet was called with HSTS disabled
      expect(require('helmet')).toHaveBeenCalledWith(expect.objectContaining({
        hsts: false,
      }));
    });

    it('should enable CSP by default', () => {
      // Create middleware
      createSecurityMiddleware();
      
      // Verify helmet was called with CSP enabled
      expect(require('helmet')).toHaveBeenCalledWith(expect.objectContaining({
        contentSecurityPolicy: expect.objectContaining({
          directives: expect.objectContaining({
            defaultSrc: ["'self'"],
          }),
        }),
      }));
    });

    it('should disable CSP if specified', () => {
      // Create middleware
      createSecurityMiddleware({
        enableCSP: false,
      });
      
      // Verify helmet was called with CSP disabled
      expect(require('helmet')).toHaveBeenCalledWith(expect.objectContaining({
        contentSecurityPolicy: false,
      }));
    });

    it('should enable XSS protection by default', () => {
      // Create middleware
      createSecurityMiddleware();
      
      // Verify helmet was called with XSS protection enabled
      expect(require('helmet')).toHaveBeenCalledWith(expect.objectContaining({
        xssFilter: true,
      }));
    });

    it('should disable XSS protection if specified', () => {
      // Create middleware
      createSecurityMiddleware({
        enableXSSProtection: false,
      });
      
      // Verify helmet was called with XSS protection disabled
      expect(require('helmet')).toHaveBeenCalledWith(expect.objectContaining({
        xssFilter: false,
      }));
    });

    it('should enable noSniff by default', () => {
      // Create middleware
      createSecurityMiddleware();
      
      // Verify helmet was called with noSniff enabled
      expect(require('helmet')).toHaveBeenCalledWith(expect.objectContaining({
        noSniff: true,
      }));
    });

    it('should disable noSniff if specified', () => {
      // Create middleware
      createSecurityMiddleware({
        enableNoSniff: false,
      });
      
      // Verify helmet was called with noSniff disabled
      expect(require('helmet')).toHaveBeenCalledWith(expect.objectContaining({
        noSniff: false,
      }));
    });

    it('should enable frame options by default', () => {
      // Create middleware
      createSecurityMiddleware();
      
      // Verify helmet was called with frame options enabled
      expect(require('helmet')).toHaveBeenCalledWith(expect.objectContaining({
        frameguard: expect.objectContaining({
          action: 'deny',
        }),
      }));
    });

    it('should disable frame options if specified', () => {
      // Create middleware
      createSecurityMiddleware({
        enableFrameOptions: false,
      });
      
      // Verify helmet was called with frame options disabled
      expect(require('helmet')).toHaveBeenCalledWith(expect.objectContaining({
        frameguard: false,
      }));
    });
  });
});
