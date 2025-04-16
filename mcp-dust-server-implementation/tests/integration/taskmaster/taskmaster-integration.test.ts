// tests/integration/taskmaster/taskmaster-integration.test.ts
import request from 'supertest';
import { app, httpServer } from '../../../src/server';
import { createMockDustService } from '../../mocks/mockDustService';
import { createTestToken } from '../../utils/test-utils';
import { workspaces } from '../../fixtures/workspaces';
import { agents } from '../../fixtures/agents';

// Mock the DustService
jest.mock('../../../src/services/dustService', () => {
  return {
    DustService: jest.fn().mockImplementation(() => createMockDustService()),
  };
});

describe('Task Master Integration Tests', () => {
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

  describe('Task Master API Integration', () => {
    it('should expose the Task Master API endpoint', async () => {
      // Make a request to the Task Master API endpoint
      const response = await request(app)
        .get('/api/v1/tasks')
        .set('Authorization', `Bearer ${token}`);

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('tasks');
      expect(Array.isArray(response.body.tasks)).toBe(true);
    });

    it('should get a specific task by ID', async () => {
      // Make a request to get a specific task
      const response = await request(app)
        .get('/api/v1/tasks/1')
        .set('Authorization', `Bearer ${token}`);

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', 1);
      expect(response.body).toHaveProperty('title');
      expect(response.body).toHaveProperty('description');
      expect(response.body).toHaveProperty('status');
    });

    it('should update a task status', async () => {
      // Make a request to update a task status
      const response = await request(app)
        .patch('/api/v1/tasks/1')
        .set('Authorization', `Bearer ${token}`)
        .send({
          status: 'IN_PROGRESS',
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', 1);
      expect(response.body).toHaveProperty('status', 'IN_PROGRESS');
    });

    it('should get the next task', async () => {
      // Make a request to get the next task
      const response = await request(app)
        .get('/api/v1/tasks/next')
        .set('Authorization', `Bearer ${token}`);

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('title');
      expect(response.body).toHaveProperty('description');
      expect(response.body).toHaveProperty('status');
    });
  });

  describe('Task Master MCP Integration', () => {
    it('should expose Task Master tools via MCP', async () => {
      // Make a request to list tools
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.tool.list',
          params: {},
          id: 2,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 2);
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('tools');
      
      // Verify that Task Master tools are included
      const tools = response.body.result.tools;
      const taskMasterTools = tools.filter(tool => tool.name.startsWith('taskmaster/'));
      expect(taskMasterTools.length).toBeGreaterThan(0);
    });

    it('should execute the Task Master list tool', async () => {
      // Make a request to execute the Task Master list tool
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.tool.execute',
          params: {
            name: 'taskmaster/list',
            parameters: {},
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
      expect(parsedText).toHaveProperty('tasks');
      expect(Array.isArray(parsedText.tasks)).toBe(true);
    });

    it('should execute the Task Master get tool', async () => {
      // Make a request to execute the Task Master get tool
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.tool.execute',
          params: {
            name: 'taskmaster/get',
            parameters: {
              taskId: 1,
            },
          },
          id: 4,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 4);
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
      expect(parsedText).toHaveProperty('id', 1);
      expect(parsedText).toHaveProperty('title');
      expect(parsedText).toHaveProperty('description');
      expect(parsedText).toHaveProperty('status');
    });

    it('should execute the Task Master update tool', async () => {
      // Make a request to execute the Task Master update tool
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.tool.execute',
          params: {
            name: 'taskmaster/update',
            parameters: {
              taskId: 1,
              status: 'DONE',
            },
          },
          id: 5,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 5);
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
      expect(parsedText).toHaveProperty('id', 1);
      expect(parsedText).toHaveProperty('status', 'DONE');
    });

    it('should execute the Task Master next tool', async () => {
      // Make a request to execute the Task Master next tool
      const response = await request(app)
        .post('/stream')
        .set('Authorization', `Bearer ${token}`)
        .set('Mcp-Session-Id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'mcp.tool.execute',
          params: {
            name: 'taskmaster/next',
            parameters: {},
          },
          id: 6,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 6);
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
      expect(parsedText).toHaveProperty('title');
      expect(parsedText).toHaveProperty('description');
      expect(parsedText).toHaveProperty('status');
    });
  });

  describe('Task Master Agent Integration', () => {
    it('should execute an agent with task context', async () => {
      // Get a workspace ID and agent ID
      const workspaceId = workspaces[0].id;
      const agent = agents.find(a => a.workspaceId === workspaceId);
      
      // Make a request to execute the agent with task context
      const response = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/agents/${agent.id}/execute`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          input: 'Complete task 1',
          taskId: 1,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('agentId', agent.id);
      expect(response.body).toHaveProperty('workspaceId', workspaceId);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('input', 'Complete task 1');
      expect(response.body).toHaveProperty('taskId', 1);
    });

    it('should execute an agent with task context via MCP', async () => {
      // Get a workspace ID and agent ID
      const workspaceId = workspaces[0].id;
      const agent = agents.find(a => a.workspaceId === workspaceId);
      
      // Make a request to execute the agent with task context
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
              input: 'Complete task 1',
              taskId: 1,
            },
          },
          id: 7,
        });

      // Verify the response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 7);
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
      expect(parsedText).toHaveProperty('input', 'Complete task 1');
      expect(parsedText).toHaveProperty('taskId', 1);
    });
  });
});
