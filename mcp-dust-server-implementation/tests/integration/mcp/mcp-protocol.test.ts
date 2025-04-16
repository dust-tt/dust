// tests/integration/mcp/mcp-protocol.test.ts
import request from 'supertest';
import { app, httpServer } from '../../../src/server';
import { createMockDustService } from '../../mocks/mockDustService';
import { createTestToken } from '../../utils/test-utils';

// Mock the DustService
jest.mock('../../../src/services/dustService', () => {
  return {
    DustService: jest.fn().mockImplementation(() => createMockDustService()),
  };
});

describe('MCP Protocol Integration Tests', () => {
  let server: any;
  let token: string;
  let sessionId: string;

  beforeAll(async () => {
    // Start the server
    server = httpServer.listen(0);
    
    // Create a test token
    token = createTestToken();
  });

  afterAll(async () => {
    // Close the server
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  describe('Session Management', () => {
    it('should create a session', async () => {
      // Make a request to create a session
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
      
      // Save the session ID for later tests
      sessionId = response.body.result.sessionId;
    });

    it('should reject requests without a session ID', async () => {
      // Make a request without a session ID
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
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
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'SESSION_REQUIRED');
    });

    it('should reject requests with an invalid session ID', async () => {
      // Make a request with an invalid session ID
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

  describe('JSON-RPC Protocol', () => {
    it('should handle JSON-RPC requests', async () => {
      // Make a JSON-RPC request
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
          id: 4,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 4);
      expect(response.body).toHaveProperty('result');
    });

    it('should reject requests with an invalid JSON-RPC version', async () => {
      // Make a request with an invalid JSON-RPC version
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '1.0',
          method: 'mcp.resource.list',
          params: {
            uri: 'dust://workspaces',
          },
          id: 5,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 5);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', -32600);
      expect(response.body.error).toHaveProperty('message', 'Invalid Request');
    });

    it('should reject requests with an invalid method', async () => {
      // Make a request with an invalid method
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'invalid.method',
          params: {},
          id: 6,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 6);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', -32601);
      expect(response.body.error).toHaveProperty('message', 'Method not found');
    });

    it('should reject requests with invalid parameters', async () => {
      // Make a request with invalid parameters
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.resource.list',
          params: {
            // Missing required uri parameter
          },
          id: 7,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 7);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', -32602);
      expect(response.body.error).toHaveProperty('message', 'Invalid params');
    });

    it('should handle batch requests', async () => {
      // Make a batch request
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send([
          {
            jsonrpc: '2.0',
            method: 'mcp.resource.list',
            params: {
              uri: 'dust://workspaces',
            },
            id: 8,
          },
          {
            jsonrpc: '2.0',
            method: 'mcp.tool.list',
            params: {},
            id: 9,
          },
        ]);

      // Verify the response
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      
      // Verify the first response
      expect(response.body[0]).toHaveProperty('jsonrpc', '2.0');
      expect(response.body[0]).toHaveProperty('id', 8);
      expect(response.body[0]).toHaveProperty('result');
      
      // Verify the second response
      expect(response.body[1]).toHaveProperty('jsonrpc', '2.0');
      expect(response.body[1]).toHaveProperty('id', 9);
      expect(response.body[1]).toHaveProperty('result');
    });

    it('should handle notifications (requests without an ID)', async () => {
      // Make a notification request
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
          // No id
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toEqual({});
    });
  });

  describe('Resource Operations', () => {
    it('should list resources', async () => {
      // Make a request to list resources
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
          id: 10,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 10);
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('items');
      expect(Array.isArray(response.body.result.items)).toBe(true);
      expect(response.body.result.items.length).toBeGreaterThan(0);
      
      // Verify the item data
      const item = response.body.result.items[0];
      expect(item).toHaveProperty('uri');
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('description');
    });

    it('should load a resource', async () => {
      // Make a request to load a resource
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.resource.load',
          params: {
            uri: 'dust://',
          },
          id: 11,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 11);
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('content');
      expect(response.body.result).toHaveProperty('mimeType', 'application/json');
      
      // Parse the content
      const content = JSON.parse(response.body.result.content.text);
      expect(content).toHaveProperty('name', 'Dust API');
      expect(content).toHaveProperty('version');
      expect(content).toHaveProperty('resources');
      expect(content.resources).toContain('dust://workspaces');
    });

    it('should reject loading a non-existent resource', async () => {
      // Make a request to load a non-existent resource
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.resource.load',
          params: {
            uri: 'dust://non-existent',
          },
          id: 12,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 12);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
    });
  });

  describe('Tool Operations', () => {
    it('should list tools', async () => {
      // Make a request to list tools
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.tool.list',
          params: {},
          id: 13,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 13);
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('tools');
      expect(Array.isArray(response.body.result.tools)).toBe(true);
      expect(response.body.result.tools.length).toBeGreaterThan(0);
      
      // Verify the tool data
      const tool = response.body.result.tools[0];
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
    });

    it('should describe a tool', async () => {
      // Make a request to describe a tool
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.tool.describe',
          params: {
            name: 'dust/agent/execute',
          },
          id: 14,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 14);
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('name', 'dust/agent/execute');
      expect(response.body.result).toHaveProperty('description');
      expect(response.body.result).toHaveProperty('parameters');
      
      // Verify the parameters
      const parameters = response.body.result.parameters;
      expect(parameters).toHaveProperty('type', 'object');
      expect(parameters).toHaveProperty('properties');
      expect(parameters.properties).toHaveProperty('workspaceId');
      expect(parameters.properties).toHaveProperty('agentId');
      expect(parameters.properties).toHaveProperty('input');
      expect(parameters).toHaveProperty('required');
      expect(parameters.required).toContain('workspaceId');
      expect(parameters.required).toContain('agentId');
      expect(parameters.required).toContain('input');
    });

    it('should reject describing a non-existent tool', async () => {
      // Make a request to describe a non-existent tool
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.tool.describe',
          params: {
            name: 'non-existent-tool',
          },
          id: 15,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 15);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
    });
  });
});
