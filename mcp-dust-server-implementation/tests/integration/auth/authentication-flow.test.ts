// tests/integration/auth/authentication-flow.test.ts
import request from 'supertest';
import { app, httpServer } from '../../../src/server';
import { createMockDustService } from '../../mocks/mockDustService';
import { createMockUserContextService } from '../../mocks/mockUserContextService';
import { users } from '../../fixtures/users';
import { TokenService } from '../../../src/services/tokenService';
import { config } from '../../../src/config';

// Mock the DustService and UserContextService
jest.mock('../../../src/services/dustService', () => {
  return {
    DustService: jest.fn().mockImplementation(() => createMockDustService()),
  };
});

jest.mock('../../../src/services/userContextService', () => {
  return {
    UserContextService: jest.fn().mockImplementation(() => createMockUserContextService()),
  };
});

describe('Authentication Flow Integration Tests', () => {
  let server: any;
  let tokenService: TokenService;

  beforeAll(async () => {
    // Start the server
    server = httpServer.listen(0);
    
    // Create a token service
    tokenService = new TokenService(config.security.secretKey);
  });

  afterAll(async () => {
    // Close the server
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  describe('Login Flow', () => {
    it('should authenticate with a valid API key', async () => {
      // Make a login request
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          apiKey: 'valid-api-key',
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user).toHaveProperty('username');
      expect(response.body.user).toHaveProperty('email');
      expect(response.body.user).toHaveProperty('workspaceId');
      
      // Verify the token
      const payload = tokenService.verifyToken(response.body.token);
      expect(payload).toHaveProperty('userId', response.body.user.id);
      expect(payload).toHaveProperty('username', response.body.user.username);
      expect(payload).toHaveProperty('email', response.body.user.email);
      expect(payload).toHaveProperty('workspaceId', response.body.user.workspaceId);
      expect(payload).toHaveProperty('permissions');
    });

    it('should reject authentication with an invalid API key', async () => {
      // Mock the DustService.validateApiKey method to return false
      const mockDustService = createMockDustService();
      mockDustService.validateApiKey.mockResolvedValue(false);
      
      // Make a login request
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          apiKey: 'invalid-api-key',
        });

      // Verify the response
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'AUTHENTICATION_ERROR');
    });

    it('should reject authentication without an API key', async () => {
      // Make a login request
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({});

      // Verify the response
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });
  });

  describe('Token Refresh Flow', () => {
    it('should refresh a valid token', async () => {
      // Create a token
      const user = users[0];
      const token = tokenService.createToken({
        userId: user.id,
        username: user.username,
        email: user.email,
        workspaceId: user.workspaceId,
        permissions: user.permissions,
      });
      
      // Make a refresh request
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({
          token,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      
      // Verify the new token
      const payload = tokenService.verifyToken(response.body.token);
      expect(payload).toHaveProperty('userId', user.id);
      expect(payload).toHaveProperty('username', user.username);
      expect(payload).toHaveProperty('email', user.email);
      expect(payload).toHaveProperty('workspaceId', user.workspaceId);
      expect(payload).toHaveProperty('permissions');
    });

    it('should reject refresh with an invalid token', async () => {
      // Make a refresh request
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({
          token: 'invalid-token',
        });

      // Verify the response
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'AUTHENTICATION_ERROR');
    });

    it('should reject refresh without a token', async () => {
      // Make a refresh request
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({});

      // Verify the response
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });
  });

  describe('Logout Flow', () => {
    it('should successfully log out', async () => {
      // Create a token
      const user = users[0];
      const token = tokenService.createToken({
        userId: user.id,
        username: user.username,
        email: user.email,
        workspaceId: user.workspaceId,
        permissions: user.permissions,
      });
      
      // Make a logout request
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('Protected Endpoints', () => {
    it('should allow access to protected endpoints with a valid token', async () => {
      // Create a token
      const user = users[0];
      const token = tokenService.createToken({
        userId: user.id,
        username: user.username,
        email: user.email,
        workspaceId: user.workspaceId,
        permissions: user.permissions,
      });
      
      // Make a request to a protected endpoint
      const response = await request(app)
        .get('/api/v1/workspaces')
        .set('Authorization', `Bearer ${token}`);

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('workspaces');
    });

    it('should deny access to protected endpoints without a token', async () => {
      // Make a request to a protected endpoint
      const response = await request(app)
        .get('/api/v1/workspaces');

      // Verify the response
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'AUTHENTICATION_ERROR');
    });

    it('should deny access to protected endpoints with an invalid token', async () => {
      // Make a request to a protected endpoint
      const response = await request(app)
        .get('/api/v1/workspaces')
        .set('Authorization', 'Bearer invalid-token');

      // Verify the response
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'AUTHENTICATION_ERROR');
    });
  });

  describe('Session Management', () => {
    it('should create a session for MCP connections', async () => {
      // Create a token
      const user = users[0];
      const token = tokenService.createToken({
        userId: user.id,
        username: user.username,
        email: user.email,
        workspaceId: user.workspaceId,
        permissions: user.permissions,
      });
      
      // Make a session creation request
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.session.create',
          params: {},
          id: 1,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 1);
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('sessionId');
      
      // Verify the session ID is valid
      const sessionId = response.body.result.sessionId;
      expect(typeof sessionId).toBe('string');
      expect(sessionId.length).toBeGreaterThan(0);
    });

    it('should use the session ID for subsequent requests', async () => {
      // Create a token
      const user = users[0];
      const token = tokenService.createToken({
        userId: user.id,
        username: user.username,
        email: user.email,
        workspaceId: user.workspaceId,
        permissions: user.permissions,
      });
      
      // Make a session creation request
      const sessionResponse = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.session.create',
          params: {},
          id: 1,
        });
      
      // Get the session ID
      const sessionId = sessionResponse.body.result.sessionId;
      
      // Make a request using the session ID
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.resource.list',
          params: {
            uri: 'dust://workspaces',
          },
          id: 2,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 2);
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('items');
    });

    it('should reject requests with an invalid session ID', async () => {
      // Create a token
      const user = users[0];
      const token = tokenService.createToken({
        userId: user.id,
        username: user.username,
        email: user.email,
        workspaceId: user.workspaceId,
        permissions: user.permissions,
      });
      
      // Make a request using an invalid session ID
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', 'invalid-session-id')
        .send({
          jsonrpc: '2.0',
          method: 'mcp.resource.list',
          params: {
            uri: 'dust://workspaces',
          },
          id: 3,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 3);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'SESSION_NOT_FOUND');
    });
  });
});
