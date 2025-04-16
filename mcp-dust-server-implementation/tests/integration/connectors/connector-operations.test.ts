// tests/integration/connectors/connector-operations.test.ts
import request from 'supertest';
import { app, httpServer } from '../../../src/server';
import { createMockDustService } from '../../mocks/mockDustService';
import { createTestToken } from '../../utils/test-utils';
import { workspaces } from '../../fixtures/workspaces';
import { connectors, connectorSyncs } from '../../fixtures/connectors';

// Mock the DustService
jest.mock('../../../src/services/dustService', () => {
  return {
    DustService: jest.fn().mockImplementation(() => createMockDustService()),
  };
});

describe('Connector Operations Integration Tests', () => {
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

  describe('REST API Connector Operations', () => {
    it('should get a specific connector by ID', async () => {
      // Get a workspace ID and connector ID
      const workspaceId = workspaces[0].id;
      const connector = connectors.find(c => c.workspaceId === workspaceId);
      
      // Make a request to get the connector
      const response = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/connectors/${connector.id}`)
        .set('Authorization', `Bearer ${token}`);

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', connector.id);
      expect(response.body).toHaveProperty('name', connector.name);
      expect(response.body).toHaveProperty('type', connector.type);
      expect(response.body).toHaveProperty('workspaceId', workspaceId);
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).toHaveProperty('updatedAt');
    });

    it('should return 404 for a non-existent connector', async () => {
      // Get a workspace ID
      const workspaceId = workspaces[0].id;
      
      // Make a request to get a non-existent connector
      const response = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/connectors/non-existent`)
        .set('Authorization', `Bearer ${token}`);

      // Verify the response
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');
    });

    it('should sync a connector', async () => {
      // Get a workspace ID and connector ID
      const workspaceId = workspaces[0].id;
      const connector = connectors.find(c => c.workspaceId === workspaceId);
      
      // Make a request to sync the connector
      const response = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/connectors/${connector.id}/sync`)
        .set('Authorization', `Bearer ${token}`);

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('connectorId', connector.id);
      expect(response.body).toHaveProperty('workspaceId', workspaceId);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('startedAt');
    });

    it('should get connector syncs', async () => {
      // Get a workspace ID and connector ID
      const workspaceId = workspaces[0].id;
      const connector = connectors.find(c => c.workspaceId === workspaceId);
      
      // Make a request to get connector syncs
      const response = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/connectors/${connector.id}/syncs`)
        .set('Authorization', `Bearer ${token}`);

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('syncs');
      expect(Array.isArray(response.body.syncs)).toBe(true);
      
      // Get the expected syncs for this connector
      const connectorSyncsList = connectorSyncs.filter(sync => sync.connectorId === connector.id && sync.workspaceId === workspaceId);
      expect(response.body.syncs.length).toBe(connectorSyncsList.length);
      
      // Verify the sync data
      const sync = response.body.syncs[0];
      expect(sync).toHaveProperty('id');
      expect(sync).toHaveProperty('connectorId', connector.id);
      expect(sync).toHaveProperty('workspaceId', workspaceId);
      expect(sync).toHaveProperty('status');
      expect(sync).toHaveProperty('startedAt');
    });

    it('should get a specific connector sync by ID', async () => {
      // Get a workspace ID, connector ID, and sync ID
      const workspaceId = workspaces[0].id;
      const connector = connectors.find(c => c.workspaceId === workspaceId);
      const sync = connectorSyncs.find(s => s.connectorId === connector.id && s.workspaceId === workspaceId);
      
      // Make a request to get the sync
      const response = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/connectors/${connector.id}/syncs/${sync.id}`)
        .set('Authorization', `Bearer ${token}`);

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', sync.id);
      expect(response.body).toHaveProperty('connectorId', connector.id);
      expect(response.body).toHaveProperty('workspaceId', workspaceId);
      expect(response.body).toHaveProperty('status', sync.status);
      expect(response.body).toHaveProperty('startedAt');
    });
  });

  describe('MCP Connector Operations', () => {
    it('should load a connector via MCP', async () => {
      // Get a workspace ID and connector ID
      const workspaceId = workspaces[0].id;
      const connector = connectors.find(c => c.workspaceId === workspaceId);
      
      // Make a request to load the connector
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.resource.load',
          params: {
            uri: `dust://workspaces/${workspaceId}/connectors/${connector.id}`,
          },
          id: 2,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 2);
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('content');
      expect(response.body.result).toHaveProperty('mimeType', 'application/json');
      
      // Parse the content
      const content = JSON.parse(response.body.result.content.text);
      expect(content).toHaveProperty('id', connector.id);
      expect(content).toHaveProperty('name', connector.name);
      expect(content).toHaveProperty('type', connector.type);
      expect(content).toHaveProperty('workspaceId', workspaceId);
    });

    it('should sync a connector via MCP tool', async () => {
      // Get a workspace ID and connector ID
      const workspaceId = workspaces[0].id;
      const connector = connectors.find(c => c.workspaceId === workspaceId);
      
      // Make a request to sync the connector
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.tool.execute',
          params: {
            name: 'dust/connector/sync',
            parameters: {
              workspaceId,
              connectorId: connector.id,
            },
          },
          id: 3,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 3);
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('content');
      expect(Array.isArray(response.body.result.content)).toBe(true);
      expect(response.body.result.content.length).toBeGreaterThan(0);
      
      // Verify the content
      const content = response.body.result.content[0];
      expect(content).toHaveProperty('type', 'text');
      expect(content).toHaveProperty('text');
      
      // Parse the text as JSON
      const parsedText = JSON.parse(content.text);
      expect(parsedText).toHaveProperty('id');
      expect(parsedText).toHaveProperty('connectorId', connector.id);
      expect(parsedText).toHaveProperty('workspaceId', workspaceId);
      expect(parsedText).toHaveProperty('status');
      expect(parsedText).toHaveProperty('startedAt');
    });

    it('should describe the connector sync tool', async () => {
      // Make a request to describe the tool
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.tool.describe',
          params: {
            name: 'dust/connector/sync',
          },
          id: 4,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 4);
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('name', 'dust/connector/sync');
      expect(response.body.result).toHaveProperty('description');
      expect(response.body.result).toHaveProperty('parameters');
      
      // Verify the parameters
      const parameters = response.body.result.parameters;
      expect(parameters).toHaveProperty('type', 'object');
      expect(parameters).toHaveProperty('properties');
      expect(parameters.properties).toHaveProperty('workspaceId');
      expect(parameters.properties).toHaveProperty('connectorId');
      expect(parameters).toHaveProperty('required');
      expect(parameters.required).toContain('workspaceId');
      expect(parameters.required).toContain('connectorId');
    });

    it('should reject connector sync with invalid parameters', async () => {
      // Make a request to sync the connector with invalid parameters
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.tool.execute',
          params: {
            name: 'dust/connector/sync',
            parameters: {
              // Missing required parameters
              workspaceId: workspaces[0].id,
              // Missing connectorId
            },
          },
          id: 5,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 5);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
    });
  });
});
