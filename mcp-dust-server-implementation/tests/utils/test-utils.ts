// tests/utils/test-utils.ts
import { Server } from 'http';
import request from 'supertest';
import { Express } from 'express';
import { MCPServer } from '../../src/server/mcp-server';
import { DustService } from '../../src/services/dustService';
import { UserContextService } from '../../src/services/userContextService';
import { TokenService } from '../../src/services/tokenService';
import { PermissionProxy } from '../../src/services/permissionProxy';
import { config } from '../../src/config';

/**
 * Create a test JWT token
 * @param payload Token payload
 * @returns JWT token
 */
export function createTestToken(payload: Record<string, any> = {}): string {
  const tokenService = new TokenService(config.security.secretKey);
  return tokenService.createToken({
    userId: 'test-user-id',
    username: 'test-user',
    email: 'test@example.com',
    workspaceId: 'test-workspace-id',
    permissions: ['read:workspaces', 'read:agents', 'execute:agents'],
    ...payload,
  });
}

/**
 * Create a test request with authentication
 * @param app Express application
 * @param token JWT token (optional, will create a default token if not provided)
 * @returns Supertest request with authentication
 */
export function createAuthenticatedRequest(app: Express, token?: string): request.SuperTest<request.Test> {
  const authToken = token || createTestToken();
  return request(app).set('Authorization', `Bearer ${authToken}`);
}

/**
 * Start a test server
 * @param app Express application
 * @param port Port to listen on
 * @returns HTTP server
 */
export function startTestServer(app: Express, port: number = 0): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      resolve(server);
    });
    server.on('error', reject);
  });
}

/**
 * Stop a test server
 * @param server HTTP server
 */
export function stopTestServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Create a test MCP server
 * @param options Test MCP server options
 * @returns MCP server
 */
export function createTestMCPServer(options: {
  dustService?: DustService;
  name?: string;
  timeout?: number;
} = {}): MCPServer {
  const {
    dustService = new DustService({
      apiKey: 'test-api-key',
      workspaceId: 'test-workspace-id',
      agentId: 'test-agent-id',
    }),
    name = 'Test MCP Server',
    timeout = 5000,
  } = options;

  return new MCPServer({
    name,
    dustService,
    timeout,
  });
}

/**
 * Create test services
 * @returns Test services
 */
export function createTestServices() {
  const dustService = new DustService({
    apiKey: 'test-api-key',
    workspaceId: 'test-workspace-id',
    agentId: 'test-agent-id',
  });

  const userContextService = new UserContextService(dustService);
  const tokenService = new TokenService(config.security.secretKey);
  const permissionProxy = new PermissionProxy(dustService, userContextService);

  return {
    dustService,
    userContextService,
    tokenService,
    permissionProxy,
  };
}

/**
 * Wait for a specified time
 * @param ms Milliseconds to wait
 * @returns Promise that resolves after the specified time
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a random string
 * @param length String length
 * @returns Random string
 */
export function randomString(length: number = 10): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
