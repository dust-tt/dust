// tests/unit/middleware/auth-middleware.test.ts
import { createAuthMiddleware } from '../../../src/middleware/auth-middleware';
import { TokenService } from '../../../src/services/tokenService';
import { Request, Response, NextFunction } from 'express';
import { mock } from 'jest-mock-extended';

describe('Authentication Middleware', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;
  let mockTokenService: TokenService;

  beforeEach(() => {
    // Create mock request, response, and next function
    req = mock<Request>();
    res = mock<Response>();
    next = jest.fn();
    
    // Create a mock TokenService
    mockTokenService = mock<TokenService>();
    
    // Set up request properties
    req.headers = {};
  });

  describe('createAuthMiddleware', () => {
    it('should create a middleware function', () => {
      // Create middleware
      const middleware = createAuthMiddleware(mockTokenService);
      
      // Verify the middleware
      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });
  });

  describe('middleware function', () => {
    it('should authenticate requests with a valid token', () => {
      // Create middleware
      const middleware = createAuthMiddleware(mockTokenService);
      
      // Set up request headers
      req.headers.authorization = 'Bearer valid-token';
      
      // Mock the TokenService.verifyToken method
      mockTokenService.verifyToken.mockReturnValue({
        userId: 'test-user-id',
        username: 'test-user',
        email: 'test@example.com',
        workspaceId: 'test-workspace-id',
        permissions: ['read:workspaces'],
      });
      
      // Call the middleware
      middleware(req, res, next);
      
      // Verify the request
      expect(req.user).toBeDefined();
      expect(req.user.userId).toBe('test-user-id');
      expect(req.user.username).toBe('test-user');
      expect(req.user.email).toBe('test@example.com');
      expect(req.user.workspaceId).toBe('test-workspace-id');
      expect(req.user.permissions).toEqual(['read:workspaces']);
      
      // Verify next was called
      expect(next).toHaveBeenCalled();
    });

    it('should reject requests without an authorization header', () => {
      // Create middleware
      const middleware = createAuthMiddleware(mockTokenService);
      
      // Call the middleware
      middleware(req, res, next);
      
      // Verify next was called with an error
      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 401,
        code: 'AUTHENTICATION_ERROR',
      }));
    });

    it('should reject requests with an invalid authorization header format', () => {
      // Create middleware
      const middleware = createAuthMiddleware(mockTokenService);
      
      // Set up request headers
      req.headers.authorization = 'InvalidFormat';
      
      // Call the middleware
      middleware(req, res, next);
      
      // Verify next was called with an error
      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 401,
        code: 'AUTHENTICATION_ERROR',
      }));
    });

    it('should reject requests with an invalid token', () => {
      // Create middleware
      const middleware = createAuthMiddleware(mockTokenService);
      
      // Set up request headers
      req.headers.authorization = 'Bearer invalid-token';
      
      // Mock the TokenService.verifyToken method to throw an error
      mockTokenService.verifyToken.mockImplementation(() => {
        throw new Error('Invalid token');
      });
      
      // Call the middleware
      middleware(req, res, next);
      
      // Verify next was called with an error
      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 401,
        code: 'AUTHENTICATION_ERROR',
      }));
    });

    it('should skip authentication for excluded paths', () => {
      // Create middleware with excluded paths
      const middleware = createAuthMiddleware(mockTokenService, {
        excludedPaths: ['/api/v1/auth/login', '/health'],
      });
      
      // Set up request path
      req.path = '/health';
      
      // Call the middleware
      middleware(req, res, next);
      
      // Verify next was called without an error
      expect(next).toHaveBeenCalledWith();
      
      // Verify the request does not have a user
      expect(req.user).toBeUndefined();
    });

    it('should use a custom token extractor', () => {
      // Create middleware with a custom token extractor
      const middleware = createAuthMiddleware(mockTokenService, {
        tokenExtractor: (req) => req.query.token as string,
      });
      
      // Set up request query
      req.query = {
        token: 'valid-token',
      };
      
      // Mock the TokenService.verifyToken method
      mockTokenService.verifyToken.mockReturnValue({
        userId: 'test-user-id',
        username: 'test-user',
      });
      
      // Call the middleware
      middleware(req, res, next);
      
      // Verify the request
      expect(req.user).toBeDefined();
      expect(req.user.userId).toBe('test-user-id');
      
      // Verify next was called
      expect(next).toHaveBeenCalled();
    });
  });
});
