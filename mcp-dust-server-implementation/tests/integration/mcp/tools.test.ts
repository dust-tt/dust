// tests/integration/mcp/tools.test.ts
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

describe('MCP Tools', () => {
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

  describe('mcp.tool.list', () => {
    it('should list available tools', async () => {
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.tool.list',
          params: {},
          id: 1,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('tools');
      expect(Array.isArray(response.body.result.tools)).toBe(true);
      expect(response.body.result.tools.length).toBeGreaterThan(0);
      
      // Check that the tools include the expected categories
      const toolNames = response.body.result.tools.map((tool: any) => tool.name);
      expect(toolNames).toContain('dust/agent/execute');
      expect(toolNames).toContain('dust/knowledge/search');
    });
  });

  describe('mcp.tool.describe', () => {
    it('should describe a tool', async () => {
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
          id: 1,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('name', 'dust/agent/execute');
      expect(response.body.result).toHaveProperty('description');
      expect(response.body.result).toHaveProperty('parameters');
    });

    it('should return an error for a non-existent tool', async () => {
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
          id: 1,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
    });
  });

  describe('mcp.tool.execute', () => {
    it('should execute the agent tool', async () => {
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.tool.execute',
          params: {
            name: 'dust/agent/execute',
            parameters: {
              workspaceId: 'workspace-1',
              agentId: 'agent-1',
              input: 'Test input',
            },
          },
          id: 1,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('content');
      expect(Array.isArray(response.body.result.content)).toBe(true);
      expect(response.body.result.content.length).toBeGreaterThan(0);
      
      // Check the content
      const content = response.body.result.content[0];
      expect(content).toHaveProperty('type', 'text');
      expect(content).toHaveProperty('text');
      
      // Parse the text as JSON
      const parsedText = JSON.parse(content.text);
      expect(parsedText).toHaveProperty('id');
      expect(parsedText).toHaveProperty('agentId', 'agent-1');
      expect(parsedText).toHaveProperty('workspaceId', 'workspace-1');
      expect(parsedText).toHaveProperty('status');
      expect(parsedText).toHaveProperty('input', 'Test input');
    });

    it('should execute the knowledge base search tool', async () => {
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.tool.execute',
          params: {
            name: 'dust/knowledge/search',
            parameters: {
              workspaceId: 'workspace-1',
              knowledgeBaseId: 'kb-1',
              query: 'Test query',
            },
          },
          id: 1,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('content');
      expect(Array.isArray(response.body.result.content)).toBe(true);
      expect(response.body.result.content.length).toBeGreaterThan(0);
      
      // Check the content
      const content = response.body.result.content[0];
      expect(content).toHaveProperty('type', 'text');
      expect(content).toHaveProperty('text');
      
      // Parse the text as JSON
      const parsedText = JSON.parse(content.text);
      expect(parsedText).toHaveProperty('id');
      expect(parsedText).toHaveProperty('knowledgeBaseId', 'kb-1');
      expect(parsedText).toHaveProperty('workspaceId', 'workspace-1');
      expect(parsedText).toHaveProperty('query', 'Test query');
      expect(parsedText).toHaveProperty('results');
      expect(Array.isArray(parsedText.results)).toBe(true);
    });

    it('should return an error for a non-existent tool', async () => {
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.tool.execute',
          params: {
            name: 'non-existent-tool',
            parameters: {},
          },
          id: 1,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
    });

    it('should return an error for invalid parameters', async () => {
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.tool.execute',
          params: {
            name: 'dust/agent/execute',
            parameters: {
              // Missing required parameters
            },
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
