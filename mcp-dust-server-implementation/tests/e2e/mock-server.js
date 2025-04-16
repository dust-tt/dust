// tests/e2e/mock-server.js
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import jwt from 'jsonwebtoken';

// Create a mock server for testing
export function createMockServer(port = 5002) {
  const app = express();
  const server = app.listen(port);

  // Middleware
  app.use(cors());
  app.use(bodyParser.json());

  // Security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });

  // Mock data
  const mockData = {
    workspaces: [
      {
        id: 'workspace-123',
        name: 'Test Workspace',
        description: 'A test workspace',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    agents: [
      {
        id: 'agent-123',
        name: 'Test Agent',
        description: 'A test agent',
        workspaceId: 'workspace-123',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    knowledgeBases: [
      {
        id: 'kb-123',
        name: 'Test Knowledge Base',
        description: 'A test knowledge base',
        workspaceId: 'workspace-123',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    connectors: [
      {
        id: 'connector-123',
        name: 'Test Connector',
        type: 'github',
        workspaceId: 'workspace-123',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    tasks: [
      {
        id: 1,
        title: 'Test Task',
        description: 'A test task',
        status: 'TODO',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    sessions: {},
  };

  // Secret key for JWT
  const secretKey = 'test_secret_key';

  // Authentication endpoints
  app.post('/api/v1/auth/login', (req, res) => {
    const { apiKey } = req.body;

    if (apiKey === 'test_api_key') {
      const token = jwt.sign(
        {
          userId: 'user-123',
          username: 'test_user',
          email: 'test@example.com',
          workspaceId: 'workspace-123',
          permissions: [
            'read:workspaces',
            'write:workspaces',
            'read:agents',
            'write:agents',
            'execute:agents',
            'read:knowledge-bases',
            'write:knowledge-bases',
            'read:connectors',
            'write:connectors',
            'execute:connectors',
          ],
        },
        secretKey,
        { expiresIn: '1h' }
      );

      res.json({
        token,
        user: {
          id: 'user-123',
          username: 'test_user',
          email: 'test@example.com',
          workspaceId: 'workspace-123',
          permissions: [
            'read:workspaces',
            'write:workspaces',
            'read:agents',
            'write:agents',
            'execute:agents',
            'read:knowledge-bases',
            'write:knowledge-bases',
            'read:connectors',
            'write:connectors',
            'execute:connectors',
          ],
        },
      });
    } else {
      res.status(401).json({
        error: {
          message: 'Invalid API key',
          code: 'AUTHENTICATION_ERROR',
        },
      });
    }
  });

  app.post('/api/v1/auth/refresh', (req, res) => {
    const { token } = req.body;

    try {
      const decoded = jwt.verify(token, secretKey);
      const newToken = jwt.sign(
        {
          userId: decoded.userId,
          username: decoded.username,
          email: decoded.email,
          workspaceId: decoded.workspaceId,
          permissions: decoded.permissions,
        },
        secretKey,
        { expiresIn: '1h' }
      );

      res.json({ token: newToken });
    } catch (error) {
      res.status(401).json({
        error: {
          message: 'Invalid token',
          code: 'AUTHENTICATION_ERROR',
        },
      });
    }
  });

  app.post('/api/v1/auth/logout', (req, res) => {
    res.status(204).send();
  });

  // Auth middleware
  const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          message: 'Authentication required',
          code: 'AUTHENTICATION_ERROR',
        },
      });
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, secretKey);
      req.user = decoded;
      next();
    } catch (error) {
      return res.status(401).json({
        error: {
          message: 'Invalid token',
          code: 'AUTHENTICATION_ERROR',
        },
      });
    }
  };

  // Workspace endpoints
  app.get('/api/v1/workspaces', authenticate, (req, res) => {
    res.json({ workspaces: mockData.workspaces });
  });

  app.get('/api/v1/workspaces/:workspaceId', authenticate, (req, res) => {
    const workspace = mockData.workspaces.find(w => w.id === req.params.workspaceId);

    if (workspace) {
      res.json(workspace);
    } else {
      res.status(404).json({
        error: {
          message: 'Workspace not found',
          code: 'RESOURCE_NOT_FOUND',
        },
      });
    }
  });

  // Agent endpoints
  app.get('/api/v1/workspaces/:workspaceId/agents', authenticate, (req, res) => {
    const agents = mockData.agents.filter(a => a.workspaceId === req.params.workspaceId);
    res.json({ agents });
  });

  app.get('/api/v1/workspaces/:workspaceId/agents/:agentId', authenticate, (req, res) => {
    const agent = mockData.agents.find(
      a => a.id === req.params.agentId && a.workspaceId === req.params.workspaceId
    );

    if (agent) {
      res.json(agent);
    } else {
      res.status(404).json({
        error: {
          message: 'Agent not found',
          code: 'RESOURCE_NOT_FOUND',
        },
      });
    }
  });

  app.post('/api/v1/workspaces/:workspaceId/agents/:agentId/execute', authenticate, (req, res) => {
    const { input, taskId } = req.body;
    const agent = mockData.agents.find(
      a => a.id === req.params.agentId && a.workspaceId === req.params.workspaceId
    );

    if (agent) {
      const response = {
        id: 'run-123',
        agentId: agent.id,
        workspaceId: agent.workspaceId,
        status: 'completed',
        input,
        output: `Response to: ${input}`,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      if (taskId) {
        response.taskId = taskId;
      }

      res.json(response);
    } else {
      res.status(404).json({
        error: {
          message: 'Agent not found',
          code: 'RESOURCE_NOT_FOUND',
        },
      });
    }
  });

  // Knowledge base endpoints
  app.get('/api/v1/workspaces/:workspaceId/knowledge-bases', authenticate, (req, res) => {
    const knowledgeBases = mockData.knowledgeBases.filter(
      kb => kb.workspaceId === req.params.workspaceId
    );
    res.json({ knowledgeBases });
  });

  app.get(
    '/api/v1/workspaces/:workspaceId/knowledge-bases/:knowledgeBaseId',
    authenticate,
    (req, res) => {
      const knowledgeBase = mockData.knowledgeBases.find(
        kb => kb.id === req.params.knowledgeBaseId && kb.workspaceId === req.params.workspaceId
      );

      if (knowledgeBase) {
        res.json(knowledgeBase);
      } else {
        res.status(404).json({
          error: {
            message: 'Knowledge base not found',
            code: 'RESOURCE_NOT_FOUND',
          },
        });
      }
    }
  );

  app.post(
    '/api/v1/workspaces/:workspaceId/knowledge-bases/:knowledgeBaseId/search',
    authenticate,
    (req, res) => {
      const { query } = req.body;
      const knowledgeBase = mockData.knowledgeBases.find(
        kb => kb.id === req.params.knowledgeBaseId && kb.workspaceId === req.params.workspaceId
      );

      if (knowledgeBase) {
        res.json({
          id: 'search-123',
          knowledgeBaseId: knowledgeBase.id,
          workspaceId: knowledgeBase.workspaceId,
          query,
          results: [
            {
              id: 'result-123',
              title: 'Test Document',
              content: 'This is a test document that matches the query',
              score: 0.95,
            },
          ],
          createdAt: new Date().toISOString(),
        });
      } else {
        res.status(404).json({
          error: {
            message: 'Knowledge base not found',
            code: 'RESOURCE_NOT_FOUND',
          },
        });
      }
    }
  );

  // Task Master endpoints
  app.get('/api/v1/tasks', authenticate, (req, res) => {
    const { status } = req.query;
    let tasks = mockData.tasks;

    if (status) {
      tasks = tasks.filter(t => t.status === status);
    }

    res.json({ tasks });
  });

  app.get('/api/v1/tasks/:taskId', authenticate, (req, res) => {
    const task = mockData.tasks.find(t => t.id === parseInt(req.params.taskId));

    if (task) {
      res.json(task);
    } else {
      res.status(404).json({
        error: {
          message: 'Task not found',
          code: 'RESOURCE_NOT_FOUND',
        },
      });
    }
  });

  app.patch('/api/v1/tasks/:taskId', authenticate, (req, res) => {
    const { status } = req.body;
    const taskId = parseInt(req.params.taskId);
    const taskIndex = mockData.tasks.findIndex(t => t.id === taskId);

    if (taskIndex !== -1) {
      mockData.tasks[taskIndex] = {
        ...mockData.tasks[taskIndex],
        status,
        updatedAt: new Date().toISOString(),
      };

      res.json(mockData.tasks[taskIndex]);
    } else {
      res.status(404).json({
        error: {
          message: 'Task not found',
          code: 'RESOURCE_NOT_FOUND',
        },
      });
    }
  });

  // Special endpoint for tasks/next that needs to be defined before the /api/v1/tasks/:taskId endpoint
  app.get('/api/v1/tasks/next', authenticate, (req, res) => {
    // Always return the first task for testing purposes
    if (mockData.tasks.length > 0) {
      res.json(mockData.tasks[0]);
    } else {
      res.status(404).json({
        error: {
          message: 'No tasks found',
          code: 'RESOURCE_NOT_FOUND',
        },
      });
    }
  });

  // MCP endpoints
  app.post('/stream', (req, res) => {
    const authHeader = req.headers.authorization;
    const sessionId = req.headers['mcp-session-id'];

    // Check authentication
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Authentication required',
        },
        id: req.body.id,
      });
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, secretKey);
      req.user = decoded;
    } catch (error) {
      return res.json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid token',
        },
        id: req.body.id,
      });
    }

    // Handle batch requests
    if (Array.isArray(req.body)) {
      const responses = req.body.map(request => handleMCPRequest(request, req.user, sessionId));
      return res.json(responses);
    }

    // Handle single request
    const response = handleMCPRequest(req.body, req.user, sessionId);
    res.json(response);
  });

  function handleMCPRequest(request, user, sessionId) {
    const { jsonrpc, method, params, id } = request;

    // Check for valid JSON-RPC request
    if (jsonrpc !== '2.0') {
      return {
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid Request',
        },
        id,
      };
    }

    // Handle session creation
    if (method === 'mcp.session.create') {
      const newSessionId = `session-${Date.now()}`;
      mockData.sessions[newSessionId] = { user };

      return {
        jsonrpc: '2.0',
        result: {
          sessionId: newSessionId,
        },
        id,
      };
    }

    // Check session for other methods
    if (!sessionId || !mockData.sessions[sessionId]) {
      return {
        jsonrpc: '2.0',
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found',
        },
        id,
      };
    }

    // Handle resource listing
    if (method === 'mcp.resource.list') {
      const { uri } = params;

      if (uri === 'dust://workspaces') {
        return {
          jsonrpc: '2.0',
          result: {
            items: mockData.workspaces.map(w => ({
              uri: `dust://workspaces/${w.id}`,
              name: w.name,
              description: w.description,
            })),
          },
          id,
        };
      } else if (uri.startsWith('dust://workspaces/') && uri.endsWith('/agents')) {
        const workspaceId = uri.split('/')[2];
        return {
          jsonrpc: '2.0',
          result: {
            items: mockData.agents
              .filter(a => a.workspaceId === workspaceId)
              .map(a => ({
                uri: `dust://workspaces/${workspaceId}/agents/${a.id}`,
                name: a.name,
                description: a.description,
              })),
          },
          id,
        };
      }

      return {
        jsonrpc: '2.0',
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'Resource not found',
        },
        id,
      };
    }

    // Handle resource loading
    if (method === 'mcp.resource.load') {
      const { uri } = params;

      if (uri.startsWith('dust://workspaces/')) {
        const parts = uri.split('/');
        const workspaceId = parts[2];

        if (parts.length === 3) {
          const workspace = mockData.workspaces.find(w => w.id === workspaceId);

          if (workspace) {
            return {
              jsonrpc: '2.0',
              result: {
                content: {
                  text: JSON.stringify(workspace),
                },
                mimeType: 'application/json',
              },
              id,
            };
          }
        }
      }

      return {
        jsonrpc: '2.0',
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'Resource not found',
        },
        id,
      };
    }

    // Handle tool listing
    if (method === 'mcp.tool.list') {
      return {
        jsonrpc: '2.0',
        result: {
          tools: [
            {
              name: 'dust/agent/execute',
              description: 'Execute a Dust agent',
            },
            {
              name: 'dust/knowledge/search',
              description: 'Search a Dust knowledge base',
            },
            {
              name: 'taskmaster/list',
              description: 'List Task Master tasks',
            },
            {
              name: 'taskmaster/get',
              description: 'Get a Task Master task',
            },
            {
              name: 'taskmaster/update',
              description: 'Update a Task Master task',
            },
            {
              name: 'taskmaster/next',
              description: 'Get the next Task Master task',
            },
          ],
        },
        id,
      };
    }

    // Handle tool description
    if (method === 'mcp.tool.describe') {
      const { name } = params;

      if (name === 'dust/agent/execute') {
        return {
          jsonrpc: '2.0',
          result: {
            name: 'dust/agent/execute',
            description: 'Execute a Dust agent',
            parameters: {
              type: 'object',
              properties: {
                workspaceId: {
                  type: 'string',
                  description: 'The ID of the workspace containing the agent',
                },
                agentId: {
                  type: 'string',
                  description: 'The ID of the agent to execute',
                },
                input: {
                  type: 'string',
                  description: 'The input to the agent',
                },
                taskId: {
                  type: 'string',
                  description: 'The ID of the Task Master task (optional)',
                },
              },
              required: ['workspaceId', 'agentId', 'input'],
            },
          },
          id,
        };
      }

      return {
        jsonrpc: '2.0',
        error: {
          code: 'TOOL_NOT_FOUND',
          message: 'Tool not found',
        },
        id,
      };
    }

    // Handle tool execution
    if (method === 'mcp.tool.execute') {
      const { name, parameters } = params;

      if (name === 'dust/agent/execute') {
        const { workspaceId, agentId, input, taskId } = parameters;

        return {
          jsonrpc: '2.0',
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  id: 'run-123',
                  agentId,
                  workspaceId,
                  status: 'completed',
                  input,
                  output: `Response to: ${input}`,
                  taskId: taskId || undefined,
                  createdAt: new Date().toISOString(),
                  completedAt: new Date().toISOString(),
                }),
              },
            ],
          },
          id,
        };
      } else if (name === 'taskmaster/list') {
        const { status } = parameters || {};
        let tasks = mockData.tasks;

        if (status) {
          tasks = tasks.filter(t => t.status === status);
        }

        return {
          jsonrpc: '2.0',
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ tasks }),
              },
            ],
          },
          id,
        };
      } else if (name === 'taskmaster/get') {
        const { taskId } = parameters;
        const task = mockData.tasks.find(t => t.id === parseInt(taskId));

        if (task) {
          return {
            jsonrpc: '2.0',
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(task),
                },
              ],
            },
            id,
          };
        } else {
          return {
            jsonrpc: '2.0',
            error: {
              code: 'RESOURCE_NOT_FOUND',
              message: 'Task not found',
            },
            id,
          };
        }
      } else if (name === 'taskmaster/update') {
        const { taskId, status } = parameters;
        const taskIndex = mockData.tasks.findIndex(t => t.id === parseInt(taskId));

        if (taskIndex !== -1) {
          mockData.tasks[taskIndex] = {
            ...mockData.tasks[taskIndex],
            status,
            updatedAt: new Date().toISOString(),
          };

          return {
            jsonrpc: '2.0',
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(mockData.tasks[taskIndex]),
                },
              ],
            },
            id,
          };
        } else {
          return {
            jsonrpc: '2.0',
            error: {
              code: 'RESOURCE_NOT_FOUND',
              message: 'Task not found',
            },
            id,
          };
        }
      } else if (name === 'taskmaster/next') {
        const task = mockData.tasks.find(t => t.status === 'TODO');

        if (task) {
          return {
            jsonrpc: '2.0',
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(task),
                },
              ],
            },
            id,
          };
        } else {
          return {
            jsonrpc: '2.0',
            error: {
              code: 'RESOURCE_NOT_FOUND',
              message: 'No tasks found',
            },
            id,
          };
        }
      }

      return {
        jsonrpc: '2.0',
        error: {
          code: 'TOOL_NOT_FOUND',
          message: 'Tool not found',
        },
        id,
      };
    }

    // Handle unknown method
    return {
      jsonrpc: '2.0',
      error: {
        code: -32601,
        message: 'Method not found',
      },
      id,
    };
  }

  // Health endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  return {
    app,
    server,
    close: () => {
      server.close();
    },
  };
}
