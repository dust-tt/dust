// tests/unit/middleware/session-middleware.test.ts
import { createSessionMiddleware } from '../../../src/middleware/session-middleware';
import { Request, Response, NextFunction } from 'express';
import { mock } from 'jest-mock-extended';
import session from 'express-session';

// Mock express-session
jest.mock('express-session', () => {
  return jest.fn().mockImplementation(() => {
    return (req: Request, res: Response, next: NextFunction) => {
      req.session = {
        id: 'test-session-id',
        cookie: {},
        regenerate: jest.fn(),
        destroy: jest.fn(),
        reload: jest.fn(),
        save: jest.fn(),
        touch: jest.fn(),
      };
      next();
    };
  });
});

describe('Session Middleware', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    // Create mock request, response, and next function
    req = mock<Request>();
    res = mock<Response>();
    next = jest.fn();
    
    // Reset the express-session mock
    (session as jest.Mock).mockClear();
  });

  describe('createSessionMiddleware', () => {
    it('should create an array of middleware functions', () => {
      // Create middleware
      const middleware = createSessionMiddleware();
      
      // Verify the middleware
      expect(middleware).toBeDefined();
      expect(Array.isArray(middleware)).toBe(true);
      expect(middleware.length).toBe(2);
      expect(typeof middleware[0]).toBe('function');
      expect(typeof middleware[1]).toBe('function');
    });

    it('should configure express-session with default options', () => {
      // Create middleware
      createSessionMiddleware();
      
      // Verify express-session was called with the correct options
      expect(session).toHaveBeenCalledWith(expect.objectContaining({
        name: 'mcp.sid',
        cookie: expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
        }),
        rolling: true,
        resave: false,
        saveUninitialized: false,
      }));
    });

    it('should use custom options if provided', () => {
      // Create middleware with custom options
      createSessionMiddleware({
        name: 'custom.sid',
        maxAge: 60000, // 1 minute
        secureCookies: true,
        sameSiteCookies: 'strict',
        httpOnly: false,
        rolling: false,
        resave: true,
        saveUninitialized: true,
      });
      
      // Verify express-session was called with the correct options
      expect(session).toHaveBeenCalledWith(expect.objectContaining({
        name: 'custom.sid',
        cookie: expect.objectContaining({
          maxAge: 60000,
          secure: true,
          sameSite: 'strict',
          httpOnly: false,
        }),
        rolling: false,
        resave: true,
        saveUninitialized: true,
      }));
    });
  });

  describe('session logging middleware', () => {
    it('should initialize a new session', () => {
      // Create middleware
      const middleware = createSessionMiddleware();
      
      // Get the session logging middleware
      const sessionLoggingMiddleware = middleware[1];
      
      // Call the middleware
      sessionLoggingMiddleware(req, res, next);
      
      // Verify the session
      expect(req.session.initialized).toBe(true);
      expect(req.session.createdAt).toBeDefined();
      expect(req.session.lastActive).toBeDefined();
      expect(req.session.userAgent).toBe(req.headers['user-agent']);
      expect(req.session.ip).toBe(req.ip);
      
      // Verify next was called
      expect(next).toHaveBeenCalled();
    });

    it('should update the last active time for an existing session', () => {
      // Create middleware
      const middleware = createSessionMiddleware();
      
      // Get the session logging middleware
      const sessionLoggingMiddleware = middleware[1];
      
      // Set up an existing session
      req.session.initialized = true;
      req.session.createdAt = '2023-01-01T00:00:00.000Z';
      req.session.lastActive = '2023-01-01T00:00:00.000Z';
      
      // Call the middleware
      sessionLoggingMiddleware(req, res, next);
      
      // Verify the session
      expect(req.session.lastActive).not.toBe('2023-01-01T00:00:00.000Z');
      
      // Verify next was called
      expect(next).toHaveBeenCalled();
    });

    it('should add a destroy hook to the session', () => {
      // Create middleware
      const middleware = createSessionMiddleware();
      
      // Get the session logging middleware
      const sessionLoggingMiddleware = middleware[1];
      
      // Save the original destroy method
      const originalDestroy = req.session.destroy;
      
      // Call the middleware
      sessionLoggingMiddleware(req, res, next);
      
      // Verify the destroy method was replaced
      expect(req.session.destroy).not.toBe(originalDestroy);
      
      // Call the new destroy method
      const callback = jest.fn();
      req.session.destroy(callback);
      
      // Verify the original destroy method was called
      expect(originalDestroy).toHaveBeenCalledWith(callback);
    });
  });
});
