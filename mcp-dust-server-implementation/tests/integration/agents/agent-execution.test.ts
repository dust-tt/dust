// tests/integration/agents/agent-execution.test.ts
import request from 'supertest';
import { app, httpServer } from '../../../src/server';
import { createMockDustService } from '../../mocks/mockDustService';
import { createTestToken } from '../../utils/test-utils';
import { workspaces } from '../../fixtures/workspaces';
import { agents, agentRuns } from '../../fixtures/agents';

// Mock the DustService
jest.mock('../../../src/services/dustService', () => {
  return {
    DustService: jest.fn().mockImplementation(() => createMockDustService()),
  };
});

describe('Agent Execution Integration Tests', () => {
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

  describe('REST API Agent Operations', () => {
    it('should get a specific agent by ID', async () => {
      // Get a workspace ID and agent ID
      const workspaceId = workspaces[0].id;
      const agent = agents.find(a => a.workspaceId === workspaceId);
      
      // Make a request to get the agent
      const response = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/agents/${agent.id}`)
        .set('Authorization', `Bearer ${token}`);

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', agent.id);
      expect(response.body).toHaveProperty('name', agent.name);
      expect(response.body).toHaveProperty('description', agent.description);
      expect(response.body).toHaveProperty('workspaceId', workspaceId);
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).toHaveProperty('updatedAt');
    });

    it('should return 404 for a non-existent agent', async () => {
      // Get a workspace ID
      const workspaceId = workspaces[0].id;
      
      // Make a request to get a non-existent agent
      const response = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/agents/non-existent`)
        .set('Authorization', `Bearer ${token}`);

      // Verify the response
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');
    });

    it('should execute an agent', async () => {
      // Get a workspace ID and agent ID
      const workspaceId = workspaces[0].id;
      const agent = agents.find(a => a.workspaceId === workspaceId);
      
      // Make a request to execute the agent
      const response = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/agents/${agent.id}/execute`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          input: 'Test input',
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('agentId', agent.id);
      expect(response.body).toHaveProperty('workspaceId', workspaceId);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('input', 'Test input');
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).toHaveProperty('updatedAt');
    });

    it('should get agent runs', async () => {
      // Get a workspace ID and agent ID
      const workspaceId = workspaces[0].id;
      const agent = agents.find(a => a.workspaceId === workspaceId);
      
      // Make a request to get agent runs
      const response = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/agents/${agent.id}/runs`)
        .set('Authorization', `Bearer ${token}`);

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('runs');
      expect(Array.isArray(response.body.runs)).toBe(true);
      
      // Get the expected runs for this agent
      const agentRunsList = agentRuns.filter(run => run.agentId === agent.id && run.workspaceId === workspaceId);
      expect(response.body.runs.length).toBe(agentRunsList.length);
      
      // Verify the run data
      const run = response.body.runs[0];
      expect(run).toHaveProperty('id');
      expect(run).toHaveProperty('agentId', agent.id);
      expect(run).toHaveProperty('workspaceId', workspaceId);
      expect(run).toHaveProperty('status');
      expect(run).toHaveProperty('input');
      expect(run).toHaveProperty('createdAt');
      expect(run).toHaveProperty('updatedAt');
    });

    it('should get a specific agent run by ID', async () => {
      // Get a workspace ID, agent ID, and run ID
      const workspaceId = workspaces[0].id;
      const agent = agents.find(a => a.workspaceId === workspaceId);
      const run = agentRuns.find(r => r.agentId === agent.id && r.workspaceId === workspaceId);
      
      // Make a request to get the run
      const response = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/agents/${agent.id}/runs/${run.id}`)
        .set('Authorization', `Bearer ${token}`);

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', run.id);
      expect(response.body).toHaveProperty('agentId', agent.id);
      expect(response.body).toHaveProperty('workspaceId', workspaceId);
      expect(response.body).toHaveProperty('status', run.status);
      expect(response.body).toHaveProperty('input', run.input);
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).toHaveProperty('updatedAt');
    });
  });

  describe('MCP Agent Operations', () => {
    it('should load an agent via MCP', async () => {
      // Get a workspace ID and agent ID
      const workspaceId = workspaces[0].id;
      const agent = agents.find(a => a.workspaceId === workspaceId);
      
      // Make a request to load the agent
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.resource.load',
          params: {
            uri: `dust://workspaces/${workspaceId}/agents/${agent.id}`,
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
      expect(content).toHaveProperty('id', agent.id);
      expect(content).toHaveProperty('name', agent.name);
      expect(content).toHaveProperty('description', agent.description);
      expect(content).toHaveProperty('workspaceId', workspaceId);
    });

    it('should execute an agent via MCP tool', async () => {
      // Get a workspace ID and agent ID
      const workspaceId = workspaces[0].id;
      const agent = agents.find(a => a.workspaceId === workspaceId);
      
      // Make a request to execute the agent
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
              workspaceId,
              agentId: agent.id,
              input: 'Test input via MCP',
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
      expect(parsedText).toHaveProperty('agentId', agent.id);
      expect(parsedText).toHaveProperty('workspaceId', workspaceId);
      expect(parsedText).toHaveProperty('status');
      expect(parsedText).toHaveProperty('input', 'Test input via MCP');
    });

    it('should describe the agent execution tool', async () => {
      // Make a request to describe the tool
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
          id: 4,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 4);
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

    it('should reject agent execution with invalid parameters', async () => {
      // Make a request to execute the agent with invalid parameters
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
              workspaceId: workspaces[0].id,
              // Missing agentId
              input: 'Test input',
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
