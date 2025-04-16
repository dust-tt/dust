# MCP Protocol Reference

This document provides a comprehensive reference for the Model Context Protocol (MCP) as implemented by the MCP Dust Server.

## Table of Contents

- [Protocol Overview](#protocol-overview)
- [JSON-RPC Format](#json-rpc-format)
- [Session Management](#session-management)
- [Resource Operations](#resource-operations)
- [Tool Operations](#tool-operations)
- [Error Handling](#error-handling)
- [Authentication](#authentication)
- [Examples](#examples)

## Protocol Overview

The Model Context Protocol (MCP) is a standardized protocol for interacting with AI models and their associated resources. It is designed to provide a consistent interface for clients to access AI capabilities, regardless of the underlying implementation.

The MCP Dust Server implements the MCP protocol to provide access to Dust's AI capabilities, including:

- Workspaces
- Agents
- Knowledge Bases
- Connectors

The protocol is based on JSON-RPC 2.0 and uses HTTP as the transport layer.

## JSON-RPC Format

### Request Format

MCP requests follow the JSON-RPC 2.0 format:

```json
{
  "jsonrpc": "2.0",
  "method": "method.name",
  "params": {
    "param1": "value1",
    "param2": "value2"
  },
  "id": 1
}
```

- `jsonrpc`: Must be "2.0"
- `method`: The method to call
- `params`: The parameters for the method
- `id`: A unique identifier for the request

### Response Format

MCP responses also follow the JSON-RPC 2.0 format:

```json
{
  "jsonrpc": "2.0",
  "result": {
    "key1": "value1",
    "key2": "value2"
  },
  "id": 1
}
```

- `jsonrpc`: Always "2.0"
- `result`: The result of the method call
- `id`: The same identifier as in the request

### Error Response Format

If an error occurs, the response will include an error object:

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32600,
    "message": "Invalid Request",
    "data": {
      "details": "Additional error details"
    }
  },
  "id": 1
}
```

- `jsonrpc`: Always "2.0"
- `error`: An object describing the error
  - `code`: A numeric error code
  - `message`: A human-readable error message
  - `data`: Additional error data (optional)
- `id`: The same identifier as in the request, or null if the request ID couldn't be determined

### Batch Requests

MCP supports batch requests, allowing multiple requests to be sent in a single HTTP request:

```json
[
  {
    "jsonrpc": "2.0",
    "method": "method1",
    "params": {},
    "id": 1
  },
  {
    "jsonrpc": "2.0",
    "method": "method2",
    "params": {},
    "id": 2
  }
]
```

The response will be an array of individual responses:

```json
[
  {
    "jsonrpc": "2.0",
    "result": {},
    "id": 1
  },
  {
    "jsonrpc": "2.0",
    "result": {},
    "id": 2
  }
]
```

### Notifications

MCP supports notifications, which are requests without an ID. Notifications do not receive a response:

```json
{
  "jsonrpc": "2.0",
  "method": "method.name",
  "params": {}
}
```

## Session Management

### Creating a Session

To create an MCP session, call the `mcp.session.create` method:

```json
{
  "jsonrpc": "2.0",
  "method": "mcp.session.create",
  "params": {},
  "id": 1
}
```

The response will include a session ID:

```json
{
  "jsonrpc": "2.0",
  "result": {
    "sessionId": "session-123"
  },
  "id": 1
}
```

### Using a Session

For subsequent requests, include the session ID in the `Mcp-Session-Id` header:

```
Mcp-Session-Id: session-123
```

### Session Expiration

Sessions expire after a period of inactivity (default: 1 hour). When a session expires, the client must create a new session.

## Resource Operations

### Resource URIs

MCP resources are identified by URIs with the following format:

```
dust://<resource-type>/<resource-id>
```

For example:

- `dust://workspaces`: All workspaces
- `dust://workspaces/workspace-123`: A specific workspace
- `dust://workspaces/workspace-123/agents`: All agents in a workspace
- `dust://workspaces/workspace-123/agents/agent-123`: A specific agent in a workspace

### Listing Resources

To list resources, call the `mcp.resource.list` method:

```json
{
  "jsonrpc": "2.0",
  "method": "mcp.resource.list",
  "params": {
    "uri": "dust://workspaces"
  },
  "id": 1
}
```

The response will include a list of resources:

```json
{
  "jsonrpc": "2.0",
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
  },
  "id": 1
}
```

### Loading a Resource

To load a resource, call the `mcp.resource.load` method:

```json
{
  "jsonrpc": "2.0",
  "method": "mcp.resource.load",
  "params": {
    "uri": "dust://workspaces/workspace-123"
  },
  "id": 1
}
```

The response will include the resource content:

```json
{
  "jsonrpc": "2.0",
  "result": {
    "content": {
      "text": "{\"id\":\"workspace-123\",\"name\":\"Workspace 1\",\"description\":\"Description of Workspace 1\"}"
    },
    "mimeType": "application/json"
  },
  "id": 1
}
```

## Tool Operations

### Listing Tools

To list available tools, call the `mcp.tool.list` method:

```json
{
  "jsonrpc": "2.0",
  "method": "mcp.tool.list",
  "params": {},
  "id": 1
}
```

The response will include a list of tools:

```json
{
  "jsonrpc": "2.0",
  "result": {
    "tools": [
      {
        "name": "dust/agent/execute",
        "description": "Execute a Dust agent"
      },
      {
        "name": "dust/knowledge/search",
        "description": "Search a Dust knowledge base"
      },
      {
        "name": "dust/connector/sync",
        "description": "Sync a Dust connector"
      }
    ]
  },
  "id": 1
}
```

### Describing a Tool

To get information about a specific tool, call the `mcp.tool.describe` method:

```json
{
  "jsonrpc": "2.0",
  "method": "mcp.tool.describe",
  "params": {
    "name": "dust/agent/execute"
  },
  "id": 1
}
```

The response will include the tool's description and parameters:

```json
{
  "jsonrpc": "2.0",
  "result": {
    "name": "dust/agent/execute",
    "description": "Execute a Dust agent",
    "parameters": {
      "type": "object",
      "properties": {
        "workspaceId": {
          "type": "string",
          "description": "The ID of the workspace containing the agent"
        },
        "agentId": {
          "type": "string",
          "description": "The ID of the agent to execute"
        },
        "input": {
          "type": "string",
          "description": "The input to the agent"
        }
      },
      "required": ["workspaceId", "agentId", "input"]
    }
  },
  "id": 1
}
```

### Executing a Tool

To execute a tool, call the `mcp.tool.execute` method:

```json
{
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
  "id": 1
}
```

The response will include the tool's output:

```json
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"id\":\"run-123\",\"agentId\":\"agent-123\",\"workspaceId\":\"workspace-123\",\"status\":\"completed\",\"input\":\"Hello, agent!\",\"output\":\"Hello, human!\"}"
      }
    ]
  },
  "id": 1
}
```

## Error Handling

### Standard JSON-RPC Errors

| Code | Message | Description |
|------|---------|-------------|
| -32700 | Parse error | Invalid JSON |
| -32600 | Invalid Request | Invalid JSON-RPC request |
| -32601 | Method not found | Invalid method name |
| -32602 | Invalid params | Invalid method parameters |
| -32603 | Internal error | Internal JSON-RPC error |
| -32000 to -32099 | Server error | Reserved for implementation-defined server errors |

### MCP-Specific Errors

| Code | Message | Description |
|------|---------|-------------|
| SESSION_REQUIRED | Session required | Missing session ID |
| SESSION_NOT_FOUND | Session not found | Invalid or expired session ID |
| RESOURCE_NOT_FOUND | Resource not found | Invalid resource URI |
| TOOL_NOT_FOUND | Tool not found | Invalid tool name |
| PERMISSION_DENIED | Permission denied | Insufficient permissions |
| VALIDATION_ERROR | Validation error | Invalid request data |
| DUST_API_ERROR | Dust API error | Error from the Dust API |

## Authentication

### Authentication Header

MCP requests must include an `Authorization` header with a JWT token:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Obtaining a Token

To obtain a JWT token, make a POST request to the `/api/v1/auth/login` endpoint:

```bash
curl -X POST http://localhost:5001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "your_dust_api_key"}'
```

The response will include a JWT token:

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

## Examples

### Creating a Session

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "mcp.session.create",
  "params": {},
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "result": {
    "sessionId": "session-123"
  },
  "id": 1
}
```

### Listing Workspaces

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "mcp.resource.list",
  "params": {
    "uri": "dust://workspaces"
  },
  "id": 2
}

// Response
{
  "jsonrpc": "2.0",
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
  },
  "id": 2
}
```

### Loading a Workspace

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "mcp.resource.load",
  "params": {
    "uri": "dust://workspaces/workspace-123"
  },
  "id": 3
}

// Response
{
  "jsonrpc": "2.0",
  "result": {
    "content": {
      "text": "{\"id\":\"workspace-123\",\"name\":\"Workspace 1\",\"description\":\"Description of Workspace 1\"}"
    },
    "mimeType": "application/json"
  },
  "id": 3
}
```

### Executing an Agent

```json
// Request
{
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
  "id": 4
}

// Response
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"id\":\"run-123\",\"agentId\":\"agent-123\",\"workspaceId\":\"workspace-123\",\"status\":\"completed\",\"input\":\"Hello, agent!\",\"output\":\"Hello, human!\"}"
      }
    ]
  },
  "id": 4
}
```
