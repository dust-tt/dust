# MCP Dust Server Tool Reference

This document provides a comprehensive reference for the tools exposed by the MCP Dust Server.

## Table of Contents

- [Tool Overview](#tool-overview)
- [Tool Categories](#tool-categories)
- [Agent Tools](#agent-tools)
  - [dust/agent/execute](#dustagentexecute)
- [Knowledge Base Tools](#knowledge-base-tools)
  - [dust/knowledge/search](#dustknowledgesearch)
- [Connector Tools](#connector-tools)
  - [dust/connector/sync](#dustconnectorsync)
- [Task Master Tools](#task-master-tools)
  - [taskmaster/list](#taskmasterlist)
  - [taskmaster/get](#taskmasterget)
  - [taskmaster/update](#taskmasterupdate)
  - [taskmaster/next](#taskmasternext)
- [Tool Operations](#tool-operations)
  - [Listing Tools](#listing-tools)
  - [Describing Tools](#describing-tools)
  - [Executing Tools](#executing-tools)
- [Tool Permissions](#tool-permissions)
- [Examples](#examples)

## Tool Overview

The MCP Dust Server exposes a set of tools that allow clients to interact with the Dust platform's capabilities. These tools are organized into categories based on their functionality.

Tools are executed using the `mcp.tool.execute` method, which takes a tool name and parameters as input and returns the tool's output.

## Tool Categories

The MCP Dust Server provides tools in the following categories:

- **Agent Tools**: Tools for executing Dust agents
- **Knowledge Base Tools**: Tools for searching Dust knowledge bases
- **Connector Tools**: Tools for managing Dust connectors
- **Task Master Tools**: Tools for managing Task Master tasks

## Agent Tools

### dust/agent/execute

Executes a Dust agent with the specified input.

**Parameters**:

| Name | Type | Description | Required |
|------|------|-------------|----------|
| workspaceId | string | The ID of the workspace containing the agent | Yes |
| agentId | string | The ID of the agent to execute | Yes |
| input | string | The input to the agent | Yes |
| taskId | string | The ID of the Task Master task (optional) | No |

**Returns**:

A JSON object containing the agent run details:

```json
{
  "id": "run-123",
  "agentId": "agent-123",
  "workspaceId": "workspace-123",
  "status": "completed",
  "input": "Hello, agent!",
  "output": "Hello, human!",
  "taskId": "task-123",
  "createdAt": "2023-01-01T00:00:00Z",
  "completedAt": "2023-01-01T00:00:01Z"
}
```

**Required Permissions**: `execute:agents`

**Example**:

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
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"id\":\"run-123\",\"agentId\":\"agent-123\",\"workspaceId\":\"workspace-123\",\"status\":\"completed\",\"input\":\"Hello, agent!\",\"output\":\"Hello, human!\",\"createdAt\":\"2023-01-01T00:00:00Z\",\"completedAt\":\"2023-01-01T00:00:01Z\"}"
      }
    ]
  },
  "id": 1
}
```

## Knowledge Base Tools

### dust/knowledge/search

Searches a Dust knowledge base with the specified query.

**Parameters**:

| Name | Type | Description | Required |
|------|------|-------------|----------|
| workspaceId | string | The ID of the workspace containing the knowledge base | Yes |
| knowledgeBaseId | string | The ID of the knowledge base to search | Yes |
| query | string | The search query | Yes |
| limit | number | The maximum number of results to return (default: 10) | No |

**Returns**:

A JSON object containing the search results:

```json
{
  "id": "search-123",
  "knowledgeBaseId": "kb-123",
  "workspaceId": "workspace-123",
  "query": "example query",
  "results": [
    {
      "id": "result-123",
      "title": "Document 1",
      "content": "Content of Document 1",
      "score": 0.95
    },
    {
      "id": "result-456",
      "title": "Document 2",
      "content": "Content of Document 2",
      "score": 0.85
    }
  ],
  "createdAt": "2023-01-01T00:00:00Z"
}
```

**Required Permissions**: `read:knowledge-bases`

**Example**:

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "mcp.tool.execute",
  "params": {
    "name": "dust/knowledge/search",
    "parameters": {
      "workspaceId": "workspace-123",
      "knowledgeBaseId": "kb-123",
      "query": "example query"
    }
  },
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"id\":\"search-123\",\"knowledgeBaseId\":\"kb-123\",\"workspaceId\":\"workspace-123\",\"query\":\"example query\",\"results\":[{\"id\":\"result-123\",\"title\":\"Document 1\",\"content\":\"Content of Document 1\",\"score\":0.95},{\"id\":\"result-456\",\"title\":\"Document 2\",\"content\":\"Content of Document 2\",\"score\":0.85}],\"createdAt\":\"2023-01-01T00:00:00Z\"}"
      }
    ]
  },
  "id": 1
}
```

## Connector Tools

### dust/connector/sync

Syncs a Dust connector.

**Parameters**:

| Name | Type | Description | Required |
|------|------|-------------|----------|
| workspaceId | string | The ID of the workspace containing the connector | Yes |
| connectorId | string | The ID of the connector to sync | Yes |

**Returns**:

A JSON object containing the connector sync details:

```json
{
  "id": "sync-123",
  "connectorId": "connector-123",
  "workspaceId": "workspace-123",
  "status": "completed",
  "startedAt": "2023-01-01T00:00:00Z",
  "completedAt": "2023-01-01T00:00:01Z"
}
```

**Required Permissions**: `execute:connectors`

**Example**:

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "mcp.tool.execute",
  "params": {
    "name": "dust/connector/sync",
    "parameters": {
      "workspaceId": "workspace-123",
      "connectorId": "connector-123"
    }
  },
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"id\":\"sync-123\",\"connectorId\":\"connector-123\",\"workspaceId\":\"workspace-123\",\"status\":\"completed\",\"startedAt\":\"2023-01-01T00:00:00Z\",\"completedAt\":\"2023-01-01T00:00:01Z\"}"
      }
    ]
  },
  "id": 1
}
```

## Task Master Tools

### taskmaster/list

Lists all Task Master tasks.

**Parameters**:

| Name | Type | Description | Required |
|------|------|-------------|----------|
| status | string | Filter tasks by status (TODO, IN_PROGRESS, DONE, BLOCKED) | No |

**Returns**:

A JSON object containing the task list:

```json
{
  "tasks": [
    {
      "id": 1,
      "title": "Task 1",
      "description": "Description of Task 1",
      "status": "TODO",
      "createdAt": "2023-01-01T00:00:00Z",
      "updatedAt": "2023-01-01T00:00:00Z"
    },
    {
      "id": 2,
      "title": "Task 2",
      "description": "Description of Task 2",
      "status": "IN_PROGRESS",
      "createdAt": "2023-01-02T00:00:00Z",
      "updatedAt": "2023-01-02T00:00:00Z"
    }
  ]
}
```

**Required Permissions**: None

**Example**:

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "mcp.tool.execute",
  "params": {
    "name": "taskmaster/list",
    "parameters": {
      "status": "TODO"
    }
  },
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"tasks\":[{\"id\":1,\"title\":\"Task 1\",\"description\":\"Description of Task 1\",\"status\":\"TODO\",\"createdAt\":\"2023-01-01T00:00:00Z\",\"updatedAt\":\"2023-01-01T00:00:00Z\"}]}"
      }
    ]
  },
  "id": 1
}
```

### taskmaster/get

Gets a specific Task Master task.

**Parameters**:

| Name | Type | Description | Required |
|------|------|-------------|----------|
| taskId | number | The ID of the task to get | Yes |

**Returns**:

A JSON object containing the task details:

```json
{
  "id": 1,
  "title": "Task 1",
  "description": "Description of Task 1",
  "status": "TODO",
  "createdAt": "2023-01-01T00:00:00Z",
  "updatedAt": "2023-01-01T00:00:00Z"
}
```

**Required Permissions**: None

**Example**:

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "mcp.tool.execute",
  "params": {
    "name": "taskmaster/get",
    "parameters": {
      "taskId": 1
    }
  },
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"id\":1,\"title\":\"Task 1\",\"description\":\"Description of Task 1\",\"status\":\"TODO\",\"createdAt\":\"2023-01-01T00:00:00Z\",\"updatedAt\":\"2023-01-01T00:00:00Z\"}"
      }
    ]
  },
  "id": 1
}
```

### taskmaster/update

Updates a Task Master task.

**Parameters**:

| Name | Type | Description | Required |
|------|------|-------------|----------|
| taskId | number | The ID of the task to update | Yes |
| status | string | The new status of the task (TODO, IN_PROGRESS, DONE, BLOCKED) | Yes |

**Returns**:

A JSON object containing the updated task details:

```json
{
  "id": 1,
  "title": "Task 1",
  "description": "Description of Task 1",
  "status": "IN_PROGRESS",
  "createdAt": "2023-01-01T00:00:00Z",
  "updatedAt": "2023-01-02T00:00:00Z"
}
```

**Required Permissions**: None

**Example**:

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "mcp.tool.execute",
  "params": {
    "name": "taskmaster/update",
    "parameters": {
      "taskId": 1,
      "status": "IN_PROGRESS"
    }
  },
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"id\":1,\"title\":\"Task 1\",\"description\":\"Description of Task 1\",\"status\":\"IN_PROGRESS\",\"createdAt\":\"2023-01-01T00:00:00Z\",\"updatedAt\":\"2023-01-02T00:00:00Z\"}"
      }
    ]
  },
  "id": 1
}
```

### taskmaster/next

Gets the next Task Master task to work on.

**Parameters**:

None

**Returns**:

A JSON object containing the next task details:

```json
{
  "id": 1,
  "title": "Task 1",
  "description": "Description of Task 1",
  "status": "TODO",
  "createdAt": "2023-01-01T00:00:00Z",
  "updatedAt": "2023-01-01T00:00:00Z"
}
```

**Required Permissions**: None

**Example**:

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "mcp.tool.execute",
  "params": {
    "name": "taskmaster/next",
    "parameters": {}
  },
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"id\":1,\"title\":\"Task 1\",\"description\":\"Description of Task 1\",\"status\":\"TODO\",\"createdAt\":\"2023-01-01T00:00:00Z\",\"updatedAt\":\"2023-01-01T00:00:00Z\"}"
      }
    ]
  },
  "id": 1
}
```

## Tool Operations

### Listing Tools

To list available tools, use the `mcp.tool.list` method:

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
      },
      {
        "name": "taskmaster/list",
        "description": "List Task Master tasks"
      },
      {
        "name": "taskmaster/get",
        "description": "Get a Task Master task"
      },
      {
        "name": "taskmaster/update",
        "description": "Update a Task Master task"
      },
      {
        "name": "taskmaster/next",
        "description": "Get the next Task Master task"
      }
    ]
  },
  "id": 1
}
```

### Describing Tools

To get information about a specific tool, use the `mcp.tool.describe` method:

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
        },
        "taskId": {
          "type": "string",
          "description": "The ID of the Task Master task (optional)"
        }
      },
      "required": ["workspaceId", "agentId", "input"]
    }
  },
  "id": 1
}
```

### Executing Tools

To execute a tool, use the `mcp.tool.execute` method:

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
        "text": "{\"id\":\"run-123\",\"agentId\":\"agent-123\",\"workspaceId\":\"workspace-123\",\"status\":\"completed\",\"input\":\"Hello, agent!\",\"output\":\"Hello, human!\",\"createdAt\":\"2023-01-01T00:00:00Z\",\"completedAt\":\"2023-01-01T00:00:01Z\"}"
      }
    ]
  },
  "id": 1
}
```

## Tool Permissions

Access to tools is controlled by permissions. The following permissions are required for different tool categories:

| Tool Category | Required Permission |
|---------------|---------------------|
| Agent Tools | `execute:agents` |
| Knowledge Base Tools | `read:knowledge-bases` |
| Connector Tools | `execute:connectors` |
| Task Master Tools | None |

## Examples

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
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"id\":\"run-123\",\"agentId\":\"agent-123\",\"workspaceId\":\"workspace-123\",\"status\":\"completed\",\"input\":\"Hello, agent!\",\"output\":\"Hello, human!\",\"createdAt\":\"2023-01-01T00:00:00Z\",\"completedAt\":\"2023-01-01T00:00:01Z\"}"
      }
    ]
  },
  "id": 1
}
```

### Searching a Knowledge Base

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "mcp.tool.execute",
  "params": {
    "name": "dust/knowledge/search",
    "parameters": {
      "workspaceId": "workspace-123",
      "knowledgeBaseId": "kb-123",
      "query": "example query"
    }
  },
  "id": 2
}

// Response
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"id\":\"search-123\",\"knowledgeBaseId\":\"kb-123\",\"workspaceId\":\"workspace-123\",\"query\":\"example query\",\"results\":[{\"id\":\"result-123\",\"title\":\"Document 1\",\"content\":\"Content of Document 1\",\"score\":0.95},{\"id\":\"result-456\",\"title\":\"Document 2\",\"content\":\"Content of Document 2\",\"score\":0.85}],\"createdAt\":\"2023-01-01T00:00:00Z\"}"
      }
    ]
  },
  "id": 2
}
```

### Updating a Task Master Task

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "mcp.tool.execute",
  "params": {
    "name": "taskmaster/update",
    "parameters": {
      "taskId": 1,
      "status": "IN_PROGRESS"
    }
  },
  "id": 3
}

// Response
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"id\":1,\"title\":\"Task 1\",\"description\":\"Description of Task 1\",\"status\":\"IN_PROGRESS\",\"createdAt\":\"2023-01-01T00:00:00Z\",\"updatedAt\":\"2023-01-02T00:00:00Z\"}"
      }
    ]
  },
  "id": 3
}
```
