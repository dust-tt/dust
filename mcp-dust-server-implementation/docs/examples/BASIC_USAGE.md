# MCP Dust Server Basic Usage

This document provides basic examples of how to use the MCP Dust Server with different clients.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Using the REST API](#using-the-rest-api)
- [Using the MCP Protocol](#using-the-mcp-protocol)
- [Using Task Master](#using-task-master)
- [Using a Custom MCP Client](#using-a-custom-mcp-client)
- [Next Steps](#next-steps)

## Prerequisites

Before you begin, ensure you have:

1. The MCP Dust Server running
2. A Dust API key
3. Access to a Dust workspace with agents and knowledge bases

## Using the REST API

The MCP Dust Server provides a REST API that can be accessed using any HTTP client.

### Authentication

First, authenticate with the server to get a JWT token:

```bash
curl -X POST http://localhost:5001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "your_dust_api_key"}'
```

Response:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-123",
    "username": "your_username",
    "email": "your_email@example.com",
    "workspaceId": "workspace-123",
    "permissions": ["read:workspaces", "read:agents", "execute:agents", ...]
  }
}
```

### Listing Workspaces

Use the token to list available workspaces:

```bash
curl -X GET http://localhost:5001/api/v1/workspaces \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

Response:

```json
{
  "workspaces": [
    {
      "id": "workspace-123",
      "name": "Workspace 1",
      "description": "Description of Workspace 1",
      "createdAt": "2023-01-01T00:00:00Z",
      "updatedAt": "2023-01-02T00:00:00Z"
    },
    {
      "id": "workspace-456",
      "name": "Workspace 2",
      "description": "Description of Workspace 2",
      "createdAt": "2023-01-03T00:00:00Z",
      "updatedAt": "2023-01-04T00:00:00Z"
    }
  ]
}
```

### Listing Agents

List agents in a workspace:

```bash
curl -X GET http://localhost:5001/api/v1/workspaces/workspace-123/agents \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

Response:

```json
{
  "agents": [
    {
      "id": "agent-123",
      "name": "Agent 1",
      "description": "Description of Agent 1",
      "workspaceId": "workspace-123",
      "createdAt": "2023-01-01T00:00:00Z",
      "updatedAt": "2023-01-02T00:00:00Z"
    },
    {
      "id": "agent-456",
      "name": "Agent 2",
      "description": "Description of Agent 2",
      "workspaceId": "workspace-123",
      "createdAt": "2023-01-03T00:00:00Z",
      "updatedAt": "2023-01-04T00:00:00Z"
    }
  ]
}
```

### Executing an Agent

Execute an agent:

```bash
curl -X POST http://localhost:5001/api/v1/workspaces/workspace-123/agents/agent-123/execute \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{"input": "Hello, agent!"}'
```

Response:

```json
{
  "id": "run-123",
  "agentId": "agent-123",
  "workspaceId": "workspace-123",
  "status": "completed",
  "input": "Hello, agent!",
  "output": "Hello, human!",
  "createdAt": "2023-01-01T00:00:00Z",
  "completedAt": "2023-01-01T00:00:01Z"
}
```

## Using the MCP Protocol

The MCP Dust Server implements the Model Context Protocol (MCP), which can be accessed using any MCP client.

### Creating a Session

First, create an MCP session:

```bash
curl -X POST http://localhost:5001/stream \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "mcp.session.create",
    "params": {},
    "id": 1
  }'
```

Response:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "sessionId": "session-123"
  }
}
```

### Listing Resources

List available resources:

```bash
curl -X POST http://localhost:5001/stream \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Mcp-Session-Id: session-123" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "mcp.resource.list",
    "params": {
      "uri": "dust://workspaces"
    },
    "id": 2
  }'
```

Response:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "items": [
      {
        "uri": "dust://workspaces/workspace-123",
        "name": "Workspace 1",
        "description": "Description of Workspace 1"
      },
      {
        "uri": "dust://workspaces/workspace-456",
        "name": "Workspace 2",
        "description": "Description of Workspace 2"
      }
    ]
  }
}
```

### Executing a Tool

Execute a tool:

```bash
curl -X POST http://localhost:5001/stream \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Mcp-Session-Id: session-123" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "mcp.tool.execute",
    "params": {
      "name": "dust/agent/execute",
      "parameters": {
        "workspaceId": "workspace-123",
        "agentId": "agent-123",
        "input": "Hello, agent!"
      }
    },
    "id": 3
  }'
```

Response:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"id\":\"run-123\",\"agentId\":\"agent-123\",\"workspaceId\":\"workspace-123\",\"status\":\"completed\",\"input\":\"Hello, agent!\",\"output\":\"Hello, human!\",\"createdAt\":\"2023-01-01T00:00:00Z\",\"completedAt\":\"2023-01-01T00:00:01Z\"}"
      }
    ]
  }
}
```

## Using Task Master

[Task Master](https://github.com/eyaltoledano/claude-task-master) is a task management tool that can be integrated with the MCP Dust Server.

### Installing Task Master

Install Task Master:

```bash
npm install -g claude-task-master
```

### Configuring Task Master

Configure Task Master to use your MCP Dust Server:

```bash
task-master config set mcp.server http://localhost:5001
```

### Testing the Connection

Test the connection to the MCP Dust Server:

```bash
task-master test-connection
```

### Creating a Task

Create a new task:

```bash
task-master create "Implement feature X" "Implement feature X with the following requirements: ..."
```

### Listing Tasks

List all tasks:

```bash
task-master list
```

### Getting the Next Task

Get the next task to work on:

```bash
task-master next
```

### Updating a Task

Update a task's status:

```bash
task-master update 1 IN_PROGRESS
```

## Using a Custom MCP Client

You can create a custom MCP client to interact with the MCP Dust Server. Here's an example using Node.js:

```javascript
const axios = require('axios');

class MCPClient {
  constructor(serverUrl, apiKey) {
    this.serverUrl = serverUrl;
    this.apiKey = apiKey;
    this.token = null;
    this.sessionId = null;
  }

  async login() {
    const response = await axios.post(`${this.serverUrl}/api/v1/auth/login`, {
      apiKey: this.apiKey,
    });
    this.token = response.data.token;
    return response.data;
  }

  async createSession() {
    const response = await axios.post(
      `${this.serverUrl}/stream`,
      {
        jsonrpc: '2.0',
        method: 'mcp.session.create',
        params: {},
        id: 1,
      },
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    this.sessionId = response.data.result.sessionId;
    return response.data;
  }

  async listResources(uri) {
    const response = await axios.post(
      `${this.serverUrl}/stream`,
      {
        jsonrpc: '2.0',
        method: 'mcp.resource.list',
        params: {
          uri,
        },
        id: 2,
      },
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Mcp-Session-Id': this.sessionId,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  }

  async executeTool(name, parameters) {
    const response = await axios.post(
      `${this.serverUrl}/stream`,
      {
        jsonrpc: '2.0',
        method: 'mcp.tool.execute',
        params: {
          name,
          parameters,
        },
        id: 3,
      },
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Mcp-Session-Id': this.sessionId,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  }
}

// Example usage
async function main() {
  const client = new MCPClient('http://localhost:5001', 'your_dust_api_key');
  
  // Login
  await client.login();
  
  // Create session
  await client.createSession();
  
  // List workspaces
  const workspaces = await client.listResources('dust://workspaces');
  console.log('Workspaces:', workspaces);
  
  // Execute agent
  const result = await client.executeTool('dust/agent/execute', {
    workspaceId: 'workspace-123',
    agentId: 'agent-123',
    input: 'Hello, agent!',
  });
  console.log('Agent execution result:', result);
}

main().catch(console.error);
```

## Next Steps

Now that you've learned the basics of using the MCP Dust Server, you can:

- Explore more [examples](../examples/) for specific use cases
- Learn about the [MCP Protocol](../reference/MCP_PROTOCOL.md) in detail
- Understand the [resource hierarchy](../reference/RESOURCES.md)
- Discover available [tools](../reference/TOOLS.md)
- Set up [monitoring](../guides/MONITORING.md) for your server
