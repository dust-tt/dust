# MCP Dust Server Resource Reference

This document provides a comprehensive reference for the resources exposed by the MCP Dust Server.

## Table of Contents

- [Resource Hierarchy](#resource-hierarchy)
- [Resource URIs](#resource-uris)
- [Resource Types](#resource-types)
  - [Root Resource](#root-resource)
  - [Workspaces](#workspaces)
  - [Agents](#agents)
  - [Knowledge Bases](#knowledge-bases)
  - [Documents](#documents)
  - [Connectors](#connectors)
- [Resource Operations](#resource-operations)
  - [Listing Resources](#listing-resources)
  - [Loading Resources](#loading-resources)
- [Resource Permissions](#resource-permissions)
- [Examples](#examples)

## Resource Hierarchy

The MCP Dust Server exposes a hierarchical resource structure that mirrors the Dust platform's organization:

```
dust://                                  # Root resource
  ├── workspaces                         # All workspaces
  │   ├── {workspaceId}                  # Specific workspace
  │   │   ├── agents                     # All agents in workspace
  │   │   │   └── {agentId}              # Specific agent
  │   │   │       └── runs               # All runs of agent
  │   │   │           └── {runId}        # Specific run
  │   │   ├── knowledge-bases            # All knowledge bases in workspace
  │   │   │   └── {knowledgeBaseId}      # Specific knowledge base
  │   │   │       └── documents          # All documents in knowledge base
  │   │   │           └── {documentId}   # Specific document
  │   │   └── connectors                 # All connectors in workspace
  │   │       └── {connectorId}          # Specific connector
  │   │           └── syncs              # All syncs of connector
  │   │               └── {syncId}       # Specific sync
  └── tools                              # All tools
```

## Resource URIs

Resources are identified by URIs with the following format:

```
dust://<resource-type>/<resource-id>
```

For example:

- `dust://workspaces`: All workspaces
- `dust://workspaces/workspace-123`: A specific workspace
- `dust://workspaces/workspace-123/agents`: All agents in a workspace
- `dust://workspaces/workspace-123/agents/agent-123`: A specific agent in a workspace

## Resource Types

### Root Resource

The root resource (`dust://`) provides information about the MCP Dust Server.

**URI**: `dust://`

**Content**:
```json
{
  "name": "Dust API",
  "version": "1.0.0",
  "resources": [
    "dust://workspaces",
    "dust://tools"
  ]
}
```

### Workspaces

Workspaces are the top-level organizational units in the Dust platform.

**URI**: `dust://workspaces`

**List Response**:
```json
{
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
```

**Load Response**:
```json
{
  "id": "workspace-123",
  "name": "Workspace 1",
  "description": "Description of Workspace 1",
  "createdAt": "2023-01-01T00:00:00Z",
  "updatedAt": "2023-01-02T00:00:00Z",
  "resources": [
    "dust://workspaces/workspace-123/agents",
    "dust://workspaces/workspace-123/knowledge-bases",
    "dust://workspaces/workspace-123/connectors"
  ]
}
```

### Agents

Agents are AI assistants that can be executed to perform tasks.

**URI**: `dust://workspaces/{workspaceId}/agents`

**List Response**:
```json
{
  "items": [
    {
      "uri": "dust://workspaces/workspace-123/agents/agent-123",
      "name": "Agent 1",
      "description": "Description of Agent 1"
    },
    {
      "uri": "dust://workspaces/workspace-123/agents/agent-456",
      "name": "Agent 2",
      "description": "Description of Agent 2"
    }
  ]
}
```

**Load Response**:
```json
{
  "id": "agent-123",
  "name": "Agent 1",
  "description": "Description of Agent 1",
  "workspaceId": "workspace-123",
  "createdAt": "2023-01-01T00:00:00Z",
  "updatedAt": "2023-01-02T00:00:00Z",
  "resources": [
    "dust://workspaces/workspace-123/agents/agent-123/runs"
  ]
}
```

### Agent Runs

Agent runs are executions of agents.

**URI**: `dust://workspaces/{workspaceId}/agents/{agentId}/runs`

**List Response**:
```json
{
  "items": [
    {
      "uri": "dust://workspaces/workspace-123/agents/agent-123/runs/run-123",
      "name": "Run 1",
      "description": "Run at 2023-01-01T00:00:00Z"
    },
    {
      "uri": "dust://workspaces/workspace-123/agents/agent-123/runs/run-456",
      "name": "Run 2",
      "description": "Run at 2023-01-02T00:00:00Z"
    }
  ]
}
```

**Load Response**:
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

### Knowledge Bases

Knowledge bases are collections of documents that can be searched.

**URI**: `dust://workspaces/{workspaceId}/knowledge-bases`

**List Response**:
```json
{
  "items": [
    {
      "uri": "dust://workspaces/workspace-123/knowledge-bases/kb-123",
      "name": "Knowledge Base 1",
      "description": "Description of Knowledge Base 1"
    },
    {
      "uri": "dust://workspaces/workspace-123/knowledge-bases/kb-456",
      "name": "Knowledge Base 2",
      "description": "Description of Knowledge Base 2"
    }
  ]
}
```

**Load Response**:
```json
{
  "id": "kb-123",
  "name": "Knowledge Base 1",
  "description": "Description of Knowledge Base 1",
  "workspaceId": "workspace-123",
  "createdAt": "2023-01-01T00:00:00Z",
  "updatedAt": "2023-01-02T00:00:00Z",
  "resources": [
    "dust://workspaces/workspace-123/knowledge-bases/kb-123/documents"
  ]
}
```

### Documents

Documents are the content units within knowledge bases.

**URI**: `dust://workspaces/{workspaceId}/knowledge-bases/{knowledgeBaseId}/documents`

**List Response**:
```json
{
  "items": [
    {
      "uri": "dust://workspaces/workspace-123/knowledge-bases/kb-123/documents/doc-123",
      "name": "Document 1",
      "description": "Description of Document 1"
    },
    {
      "uri": "dust://workspaces/workspace-123/knowledge-bases/kb-123/documents/doc-456",
      "name": "Document 2",
      "description": "Description of Document 2"
    }
  ]
}
```

**Load Response**:
```json
{
  "id": "doc-123",
  "title": "Document 1",
  "content": "Content of Document 1",
  "knowledgeBaseId": "kb-123",
  "workspaceId": "workspace-123",
  "createdAt": "2023-01-01T00:00:00Z",
  "updatedAt": "2023-01-02T00:00:00Z"
}
```

### Connectors

Connectors are integrations with external data sources.

**URI**: `dust://workspaces/{workspaceId}/connectors`

**List Response**:
```json
{
  "items": [
    {
      "uri": "dust://workspaces/workspace-123/connectors/connector-123",
      "name": "Connector 1",
      "description": "Description of Connector 1"
    },
    {
      "uri": "dust://workspaces/workspace-123/connectors/connector-456",
      "name": "Connector 2",
      "description": "Description of Connector 2"
    }
  ]
}
```

**Load Response**:
```json
{
  "id": "connector-123",
  "name": "Connector 1",
  "type": "github",
  "workspaceId": "workspace-123",
  "createdAt": "2023-01-01T00:00:00Z",
  "updatedAt": "2023-01-02T00:00:00Z",
  "resources": [
    "dust://workspaces/workspace-123/connectors/connector-123/syncs"
  ]
}
```

### Connector Syncs

Connector syncs are synchronization operations for connectors.

**URI**: `dust://workspaces/{workspaceId}/connectors/{connectorId}/syncs`

**List Response**:
```json
{
  "items": [
    {
      "uri": "dust://workspaces/workspace-123/connectors/connector-123/syncs/sync-123",
      "name": "Sync 1",
      "description": "Sync at 2023-01-01T00:00:00Z"
    },
    {
      "uri": "dust://workspaces/workspace-123/connectors/connector-123/syncs/sync-456",
      "name": "Sync 2",
      "description": "Sync at 2023-01-02T00:00:00Z"
    }
  ]
}
```

**Load Response**:
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

## Resource Operations

### Listing Resources

To list resources, use the `mcp.resource.list` method:

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

### Loading Resources

To load a resource, use the `mcp.resource.load` method:

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
      "text": "{\"id\":\"workspace-123\",\"name\":\"Workspace 1\",\"description\":\"Description of Workspace 1\",\"createdAt\":\"2023-01-01T00:00:00Z\",\"updatedAt\":\"2023-01-02T00:00:00Z\",\"resources\":[\"dust://workspaces/workspace-123/agents\",\"dust://workspaces/workspace-123/knowledge-bases\",\"dust://workspaces/workspace-123/connectors\"]}"
    },
    "mimeType": "application/json"
  },
  "id": 1
}
```

## Resource Permissions

Access to resources is controlled by permissions. The following permissions are required for different resource types:

| Resource Type | List Permission | Load Permission |
|---------------|-----------------|-----------------|
| Workspaces | `read:workspaces` | `read:workspaces` |
| Agents | `read:agents` | `read:agents` |
| Agent Runs | `read:agents` | `read:agents` |
| Knowledge Bases | `read:knowledge-bases` | `read:knowledge-bases` |
| Documents | `read:knowledge-bases` | `read:knowledge-bases` |
| Connectors | `read:connectors` | `read:connectors` |
| Connector Syncs | `read:connectors` | `read:connectors` |

## Examples

### Listing Workspaces

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "mcp.resource.list",
  "params": {
    "uri": "dust://workspaces"
  },
  "id": 1
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
  "id": 1
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
  "id": 2
}

// Response
{
  "jsonrpc": "2.0",
  "result": {
    "content": {
      "text": "{\"id\":\"workspace-123\",\"name\":\"Workspace 1\",\"description\":\"Description of Workspace 1\",\"createdAt\":\"2023-01-01T00:00:00Z\",\"updatedAt\":\"2023-01-02T00:00:00Z\",\"resources\":[\"dust://workspaces/workspace-123/agents\",\"dust://workspaces/workspace-123/knowledge-bases\",\"dust://workspaces/workspace-123/connectors\"]}"
    },
    "mimeType": "application/json"
  },
  "id": 2
}
```

### Listing Agents in a Workspace

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "mcp.resource.list",
  "params": {
    "uri": "dust://workspaces/workspace-123/agents"
  },
  "id": 3
}

// Response
{
  "jsonrpc": "2.0",
  "result": {
    "items": [
      {
        "uri": "dust://workspaces/workspace-123/agents/agent-123",
        "name": "Agent 1",
        "description": "Description of Agent 1"
      },
      {
        "uri": "dust://workspaces/workspace-123/agents/agent-456",
        "name": "Agent 2",
        "description": "Description of Agent 2"
      }
    ]
  },
  "id": 3
}
```

### Loading an Agent

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "mcp.resource.load",
  "params": {
    "uri": "dust://workspaces/workspace-123/agents/agent-123"
  },
  "id": 4
}

// Response
{
  "jsonrpc": "2.0",
  "result": {
    "content": {
      "text": "{\"id\":\"agent-123\",\"name\":\"Agent 1\",\"description\":\"Description of Agent 1\",\"workspaceId\":\"workspace-123\",\"createdAt\":\"2023-01-01T00:00:00Z\",\"updatedAt\":\"2023-01-02T00:00:00Z\",\"resources\":[\"dust://workspaces/workspace-123/agents/agent-123/runs\"]}"
    },
    "mimeType": "application/json"
  },
  "id": 4
}
```
