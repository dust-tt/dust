// tests/e2e/taskmaster-integration.test.ts
import { request, getAuthHeader, mcpRequest } from './setup.js';

describe('Task Master Integration', () => {
  let authToken: string;
  let taskId: number;

  beforeAll(async () => {
    // Get authentication token
    const loginResponse = await request
      .post('/api/v1/auth/login')
      .send({ apiKey: 'test_api_key' })
      .expect(200);

    authToken = loginResponse.body.token;
  });

  test('List tasks using MCP tool', async () => {
    const response = await mcpRequest(
      'mcp.tool.execute',
      {
        name: 'taskmaster/list',
        parameters: {},
      },
      1
    );

    expect(response.body).toHaveProperty('jsonrpc', '2.0');
    expect(response.body).toHaveProperty('id', 1);
    expect(response.body).toHaveProperty('result');
    expect(response.body.result).toHaveProperty('content');
    expect(Array.isArray(response.body.result.content)).toBe(true);

    // Parse the content
    const content = JSON.parse(response.body.result.content[0].text);
    expect(content).toHaveProperty('tasks');
    expect(Array.isArray(content.tasks)).toBe(true);
  });

  test('Get next task using MCP tool', async () => {
    const response = await mcpRequest(
      'mcp.tool.execute',
      {
        name: 'taskmaster/next',
        parameters: {},
      },
      2
    );

    expect(response.body).toHaveProperty('jsonrpc', '2.0');
    expect(response.body).toHaveProperty('id', 2);
    expect(response.body).toHaveProperty('result');
    expect(response.body.result).toHaveProperty('content');

    // If there are tasks, we should get one
    if (response.body.result.content[0].text) {
      const task = JSON.parse(response.body.result.content[0].text);
      expect(task).toHaveProperty('id');
      expect(task).toHaveProperty('title');
      expect(task).toHaveProperty('description');
      expect(task).toHaveProperty('status');

      taskId = task.id;
    }
  });

  test('Update task status using MCP tool', async () => {
    // Skip if no task ID
    if (!taskId) {
      console.warn('Skipping test: No task ID available');
      return;
    }

    const response = await mcpRequest(
      'mcp.tool.execute',
      {
        name: 'taskmaster/update',
        parameters: {
          taskId,
          status: 'IN_PROGRESS',
        },
      },
      3
    );

    expect(response.body).toHaveProperty('jsonrpc', '2.0');
    expect(response.body).toHaveProperty('id', 3);
    expect(response.body).toHaveProperty('result');
    expect(response.body.result).toHaveProperty('content');

    if (response.body.result && response.body.result.content && response.body.result.content[0]) {
      const task = JSON.parse(response.body.result.content[0].text);
      expect(task).toHaveProperty('id', taskId);
      expect(task).toHaveProperty('status', 'IN_PROGRESS');
    } else {
      console.warn('Skipping assertions: No valid response content');
    }
  });

  test('Get task details using MCP tool', async () => {
    // Skip if no task ID
    if (!taskId) {
      console.warn('Skipping test: No task ID available');
      return;
    }

    const response = await mcpRequest(
      'mcp.tool.execute',
      {
        name: 'taskmaster/get',
        parameters: {
          taskId,
        },
      },
      4
    );

    expect(response.body).toHaveProperty('jsonrpc', '2.0');
    expect(response.body).toHaveProperty('id', 4);
    expect(response.body).toHaveProperty('result');
    expect(response.body.result).toHaveProperty('content');

    if (response.body.result && response.body.result.content && response.body.result.content[0]) {
      const task = JSON.parse(response.body.result.content[0].text);
      expect(task).toHaveProperty('id', taskId);
      expect(task).toHaveProperty('title');
      expect(task).toHaveProperty('description');
      expect(task).toHaveProperty('status', 'IN_PROGRESS');
    } else {
      console.warn('Skipping assertions: No valid response content');
    }
  });

  test('Execute agent with task context', async () => {
    // Skip if no task ID
    if (!taskId) {
      console.warn('Skipping test: No task ID available');
      return;
    }

    const response = await mcpRequest(
      'mcp.tool.execute',
      {
        name: 'dust/agent/execute',
        parameters: {
          workspaceId: 'workspace-123',
          agentId: 'agent-123',
          input: 'Hello, agent!',
          taskId: taskId.toString(),
        },
      },
      5
    );

    expect(response.body).toHaveProperty('jsonrpc', '2.0');
    expect(response.body).toHaveProperty('id', 5);
    expect(response.body).toHaveProperty('result');
    expect(response.body.result).toHaveProperty('content');
    expect(Array.isArray(response.body.result.content)).toBe(true);

    if (response.body.result && response.body.result.content && response.body.result.content[0]) {
      const result = JSON.parse(response.body.result.content[0].text);
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('agentId', 'agent-123');
      expect(result).toHaveProperty('workspaceId', 'workspace-123');
      expect(result).toHaveProperty('input', 'Hello, agent!');
      expect(result).toHaveProperty('output');
      expect(result).toHaveProperty('taskId', taskId.toString());
    } else {
      console.warn('Skipping assertions: No valid response content');
    }
  });

  test('Mark task as done', async () => {
    // Skip if no task ID
    if (!taskId) {
      console.warn('Skipping test: No task ID available');
      return;
    }

    const response = await mcpRequest(
      'mcp.tool.execute',
      {
        name: 'taskmaster/update',
        parameters: {
          taskId,
          status: 'DONE',
        },
      },
      6
    );

    expect(response.body).toHaveProperty('jsonrpc', '2.0');
    expect(response.body).toHaveProperty('id', 6);
    expect(response.body).toHaveProperty('result');
    expect(response.body.result).toHaveProperty('content');

    if (response.body.result && response.body.result.content && response.body.result.content[0]) {
      const task = JSON.parse(response.body.result.content[0].text);
      expect(task).toHaveProperty('id', taskId);
      expect(task).toHaveProperty('status', 'DONE');
    } else {
      console.warn('Skipping assertions: No valid response content');
    }
  });
});
