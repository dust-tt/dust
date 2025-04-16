// tests/integration/mcp/resources.test.ts
import request from 'supertest';
import { app, httpServer, mcpServer } from '../../../src/server';
import { createMockDustService } from '../../mocks/mockDustService';
import { createTestToken } from '../../utils/test-utils';

// Mock the DustService
jest.mock('../../../src/services/dustService', () => {
  return {
    DustService: jest.fn().mockImplementation(() => createMockDustService()),
  };
});

describe('MCP Resources', () => {
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

  beforeEach(async () => {
    // Create a session for each test
    const response = await request(app)
      .post('/stream')
      .set('Authorization', `Bearer ${token}`)
      .send({
        jsonrpc: '2.0',
        method: 'mcp.session.create',
        params: {},
        id: 1,
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('result');
    expect(response.body.result).toHaveProperty('sessionId');
    
    sessionId = response.body.result.sessionId;
  });

  afterEach(async () => {
    // Clean up the session
    if (sessionId) {
      mcpServer.destroySession(sessionId);
    }
  });

  describe('mcp.resource.load', () => {
    it('should load the root resource', async () => {
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
          id: 1,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('content');
      expect(response.body.result).toHaveProperty('mimeType', 'application/json');
    });

    it('should load a workspace resource', async () => {
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.resource.load',
          params: {
            uri: 'dust://workspaces/workspace-1',
          },
          id: 1,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('content');
      expect(response.body.result).toHaveProperty('mimeType', 'application/json');
      
      // Parse the content
      const content = JSON.parse(response.body.result.content.text);
      expect(content).toHaveProperty('id', 'workspace-1');
      expect(content).toHaveProperty('name');
      expect(content).toHaveProperty('description');
    });

    it('should load an agent resource', async () => {
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.resource.load',
          params: {
            uri: 'dust://workspaces/workspace-1/agents/agent-1',
          },
          id: 1,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('content');
      expect(response.body.result).toHaveProperty('mimeType', 'application/json');
      
      // Parse the content
      const content = JSON.parse(response.body.result.content.text);
      expect(content).toHaveProperty('id', 'agent-1');
      expect(content).toHaveProperty('name');
      expect(content).toHaveProperty('description');
      expect(content).toHaveProperty('workspaceId', 'workspace-1');
    });

    it('should return an error for an invalid resource URI', async () => {
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.resource.load',
          params: {
            uri: 'invalid-uri',
          },
          id: 1,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
    });

    it('should return an error for a non-existent resource', async () => {
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.resource.load',
          params: {
            uri: 'dust://workspaces/non-existent',
          },
          id: 1,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
    });
  });

  describe('mcp.resource.list', () => {
    it('should list workspaces', async () => {
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
          id: 1,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('items');
      expect(Array.isArray(response.body.result.items)).toBe(true);
      expect(response.body.result.items.length).toBeGreaterThan(0);
      
      // Check the first item
      const firstItem = response.body.result.items[0];
      expect(firstItem).toHaveProperty('uri');
      expect(firstItem).toHaveProperty('name');
      expect(firstItem).toHaveProperty('description');
    });

    it('should list agents in a workspace', async () => {
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.resource.list',
          params: {
            uri: 'dust://workspaces/workspace-1/agents',
          },
          id: 1,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('items');
      expect(Array.isArray(response.body.result.items)).toBe(true);
      expect(response.body.result.items.length).toBeGreaterThan(0);
      
      // Check the first item
      const firstItem = response.body.result.items[0];
      expect(firstItem).toHaveProperty('uri');
      expect(firstItem).toHaveProperty('name');
      expect(firstItem).toHaveProperty('description');
    });

    it('should return an error for an invalid list URI', async () => {
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.resource.list',
          params: {
            uri: 'invalid-uri',
          },
          id: 1,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
    });

    it('should return an error for a non-existent list resource', async () => {
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.resource.list',
          params: {
            uri: 'dust://workspaces/non-existent/agents',
          },
          id: 1,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
    });
  });
});
