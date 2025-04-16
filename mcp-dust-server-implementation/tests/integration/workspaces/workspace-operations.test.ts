// tests/integration/workspaces/workspace-operations.test.ts
import request from 'supertest';
import { app, httpServer } from '../../../src/server';
import { createMockDustService } from '../../mocks/mockDustService';
import { createTestToken } from '../../utils/test-utils';
import { workspaces } from '../../fixtures/workspaces';
import { agents } from '../../fixtures/agents';
import { knowledgeBases } from '../../fixtures/knowledgeBases';
import { connectors } from '../../fixtures/connectors';

// Mock the DustService
jest.mock('../../../src/services/dustService', () => {
  return {
    DustService: jest.fn().mockImplementation(() => createMockDustService()),
  };
});

describe('Workspace Operations Integration Tests', () => {
  let server: any;
  let token: string;
  let sessionId: string;

  beforeAll(async () => {
    // Start the server
    server = httpServer.listen(0);
    
    // Create a test token
    token = createTestToken();
    
    // Create a session
    const sessionResponse = await request(app)
      .post('/stream')
      .set('Authorization', `Bearer ${token}`)
      .send({
        jsonrpc: '2.0',
        method: 'mcp.session.create',
        params: {},
        id: 1,
      });
    
    sessionId = sessionResponse.body.result.sessionId;
  });

  afterAll(async () => {
    // Close the server
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  describe('REST API Workspace Operations', () => {
    it('should list all workspaces', async () => {
      // Make a request to list workspaces
      const response = await request(app)
        .get('/api/v1/workspaces')
        .set('Authorization', `Bearer ${token}`);

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('workspaces');
      expect(Array.isArray(response.body.workspaces)).toBe(true);
      expect(response.body.workspaces.length).toBe(workspaces.length);
      
      // Verify the workspace data
      const workspace = response.body.workspaces[0];
      expect(workspace).toHaveProperty('id');
      expect(workspace).toHaveProperty('name');
      expect(workspace).toHaveProperty('description');
      expect(workspace).toHaveProperty('createdAt');
      expect(workspace).toHaveProperty('updatedAt');
    });

    it('should get a specific workspace by ID', async () => {
      // Get a workspace ID
      const workspaceId = workspaces[0].id;
      
      // Make a request to get the workspace
      const response = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}`)
        .set('Authorization', `Bearer ${token}`);

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', workspaceId);
      expect(response.body).toHaveProperty('name', workspaces[0].name);
      expect(response.body).toHaveProperty('description', workspaces[0].description);
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).toHaveProperty('updatedAt');
    });

    it('should return 404 for a non-existent workspace', async () => {
      // Make a request to get a non-existent workspace
      const response = await request(app)
        .get('/api/v1/workspaces/non-existent')
        .set('Authorization', `Bearer ${token}`);

      // Verify the response
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');
    });

    it('should list agents in a workspace', async () => {
      // Get a workspace ID
      const workspaceId = workspaces[0].id;
      
      // Make a request to list agents
      const response = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/agents`)
        .set('Authorization', `Bearer ${token}`);

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('agents');
      expect(Array.isArray(response.body.agents)).toBe(true);
      
      // Get the expected agents for this workspace
      const workspaceAgents = agents.filter(agent => agent.workspaceId === workspaceId);
      expect(response.body.agents.length).toBe(workspaceAgents.length);
      
      // Verify the agent data
      const agent = response.body.agents[0];
      expect(agent).toHaveProperty('id');
      expect(agent).toHaveProperty('name');
      expect(agent).toHaveProperty('description');
      expect(agent).toHaveProperty('workspaceId', workspaceId);
      expect(agent).toHaveProperty('createdAt');
      expect(agent).toHaveProperty('updatedAt');
    });

    it('should list knowledge bases in a workspace', async () => {
      // Get a workspace ID
      const workspaceId = workspaces[0].id;
      
      // Make a request to list knowledge bases
      const response = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/knowledge-bases`)
        .set('Authorization', `Bearer ${token}`);

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('knowledgeBases');
      expect(Array.isArray(response.body.knowledgeBases)).toBe(true);
      
      // Get the expected knowledge bases for this workspace
      const workspaceKBs = knowledgeBases.filter(kb => kb.workspaceId === workspaceId);
      expect(response.body.knowledgeBases.length).toBe(workspaceKBs.length);
      
      // Verify the knowledge base data
      const kb = response.body.knowledgeBases[0];
      expect(kb).toHaveProperty('id');
      expect(kb).toHaveProperty('name');
      expect(kb).toHaveProperty('description');
      expect(kb).toHaveProperty('workspaceId', workspaceId);
      expect(kb).toHaveProperty('createdAt');
      expect(kb).toHaveProperty('updatedAt');
    });

    it('should list connectors in a workspace', async () => {
      // Get a workspace ID
      const workspaceId = workspaces[0].id;
      
      // Make a request to list connectors
      const response = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/connectors`)
        .set('Authorization', `Bearer ${token}`);

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('connectors');
      expect(Array.isArray(response.body.connectors)).toBe(true);
      
      // Get the expected connectors for this workspace
      const workspaceConnectors = connectors.filter(connector => connector.workspaceId === workspaceId);
      expect(response.body.connectors.length).toBe(workspaceConnectors.length);
      
      // Verify the connector data
      const connector = response.body.connectors[0];
      expect(connector).toHaveProperty('id');
      expect(connector).toHaveProperty('name');
      expect(connector).toHaveProperty('type');
      expect(connector).toHaveProperty('workspaceId', workspaceId);
      expect(connector).toHaveProperty('createdAt');
      expect(connector).toHaveProperty('updatedAt');
    });
  });

  describe('MCP Workspace Operations', () => {
    it('should list workspaces via MCP', async () => {
      // Make a request to list workspaces
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
      expect(Array.isArray(response.body.result.items)).toBe(true);
      expect(response.body.result.items.length).toBe(workspaces.length);
      
      // Verify the workspace data
      const workspace = response.body.result.items[0];
      expect(workspace).toHaveProperty('uri', `dust://workspaces/${workspaces[0].id}`);
      expect(workspace).toHaveProperty('name', workspaces[0].name);
      expect(workspace).toHaveProperty('description', workspaces[0].description);
    });

    it('should load a workspace via MCP', async () => {
      // Get a workspace ID
      const workspaceId = workspaces[0].id;
      
      // Make a request to load the workspace
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.resource.load',
          params: {
            uri: `dust://workspaces/${workspaceId}`,
          },
          id: 3,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 3);
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('content');
      expect(response.body.result).toHaveProperty('mimeType', 'application/json');
      
      // Parse the content
      const content = JSON.parse(response.body.result.content.text);
      expect(content).toHaveProperty('id', workspaceId);
      expect(content).toHaveProperty('name', workspaces[0].name);
      expect(content).toHaveProperty('description', workspaces[0].description);
    });

    it('should list agents in a workspace via MCP', async () => {
      // Get a workspace ID
      const workspaceId = workspaces[0].id;
      
      // Make a request to list agents
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.resource.list',
          params: {
            uri: `dust://workspaces/${workspaceId}/agents`,
          },
          id: 4,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 4);
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('items');
      expect(Array.isArray(response.body.result.items)).toBe(true);
      
      // Get the expected agents for this workspace
      const workspaceAgents = agents.filter(agent => agent.workspaceId === workspaceId);
      expect(response.body.result.items.length).toBe(workspaceAgents.length);
      
      // Verify the agent data
      const agent = response.body.result.items[0];
      expect(agent).toHaveProperty('uri', `dust://workspaces/${workspaceId}/agents/${workspaceAgents[0].id}`);
      expect(agent).toHaveProperty('name', workspaceAgents[0].name);
      expect(agent).toHaveProperty('description', workspaceAgents[0].description);
    });

    it('should list knowledge bases in a workspace via MCP', async () => {
      // Get a workspace ID
      const workspaceId = workspaces[0].id;
      
      // Make a request to list knowledge bases
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.resource.list',
          params: {
            uri: `dust://workspaces/${workspaceId}/knowledge-bases`,
          },
          id: 5,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 5);
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('items');
      expect(Array.isArray(response.body.result.items)).toBe(true);
      
      // Get the expected knowledge bases for this workspace
      const workspaceKBs = knowledgeBases.filter(kb => kb.workspaceId === workspaceId);
      expect(response.body.result.items.length).toBe(workspaceKBs.length);
      
      // Verify the knowledge base data
      const kb = response.body.result.items[0];
      expect(kb).toHaveProperty('uri', `dust://workspaces/${workspaceId}/knowledge-bases/${workspaceKBs[0].id}`);
      expect(kb).toHaveProperty('name', workspaceKBs[0].name);
      expect(kb).toHaveProperty('description', workspaceKBs[0].description);
    });

    it('should list connectors in a workspace via MCP', async () => {
      // Get a workspace ID
      const workspaceId = workspaces[0].id;
      
      // Make a request to list connectors
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.resource.list',
          params: {
            uri: `dust://workspaces/${workspaceId}/connectors`,
          },
          id: 6,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 6);
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('items');
      expect(Array.isArray(response.body.result.items)).toBe(true);
      
      // Get the expected connectors for this workspace
      const workspaceConnectors = connectors.filter(connector => connector.workspaceId === workspaceId);
      expect(response.body.result.items.length).toBe(workspaceConnectors.length);
      
      // Verify the connector data
      const connector = response.body.result.items[0];
      expect(connector).toHaveProperty('uri', `dust://workspaces/${workspaceId}/connectors/${workspaceConnectors[0].id}`);
      expect(connector).toHaveProperty('name', workspaceConnectors[0].name);
      expect(connector).toHaveProperty('type', workspaceConnectors[0].type);
    });
  });
});
