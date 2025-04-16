# MCP Dust Server API Documentation

This document provides detailed information about the API endpoints and MCP resources/tools available in the MCP Dust Server.

## Table of Contents

- [MCP Resources](#mcp-resources)
- [MCP Tools](#mcp-tools)
- [REST API Endpoints](#rest-api-endpoints)
- [Authentication](#authentication)
- [Error Handling](#error-handling)
- [Pagination](#pagination)
- [Rate Limiting](#rate-limiting)

## MCP Resources

The MCP Dust Server exposes Dust's functionality through a hierarchical resource structure. Each resource is identified by a URI and can be accessed using the MCP protocol.

### Root Resource

- **URI**: `dust://`
- **Description**: Root of the Dust API
- **Returns**: Information about the API, including available resources and version

### Workspaces

- **URI**: `dust://workspaces`
- **Description**: List of workspaces
- **Returns**: Array of workspace objects

### Workspace

- **URI**: `dust://workspaces/{workspaceId}`
- **Description**: Workspace details
- **Parameters**:
  - `workspaceId` (string): ID of the workspace
- **Returns**: Workspace object with details

### Agents

- **URI**: `dust://workspaces/{workspaceId}/agents`
- **Description**: List of agents in a workspace
- **Parameters**:
  - `workspaceId` (string): ID of the workspace
- **Returns**: Array of agent objects

### Agent

- **URI**: `dust://workspaces/{workspaceId}/agents/{agentId}`
- **Description**: Agent details
- **Parameters**:
  - `workspaceId` (string): ID of the workspace
  - `agentId` (string): ID of the agent
- **Returns**: Agent object with details

### Knowledge Bases

- **URI**: `dust://workspaces/{workspaceId}/knowledge-bases`
- **Description**: List of knowledge bases in a workspace
- **Parameters**:
  - `workspaceId` (string): ID of the workspace
- **Returns**: Array of knowledge base objects

### Knowledge Base

- **URI**: `dust://workspaces/{workspaceId}/knowledge-bases/{knowledgeBaseId}`
- **Description**: Knowledge base details
- **Parameters**:
  - `workspaceId` (string): ID of the workspace
  - `knowledgeBaseId` (string): ID of the knowledge base
- **Returns**: Knowledge base object with details

### Connectors

- **URI**: `dust://workspaces/{workspaceId}/connectors`
- **Description**: List of connectors in a workspace
- **Parameters**:
  - `workspaceId` (string): ID of the workspace
- **Returns**: Array of connector objects

### Connector

- **URI**: `dust://workspaces/{workspaceId}/connectors/{connectorId}`
- **Description**: Connector details
- **Parameters**:
  - `workspaceId` (string): ID of the workspace
  - `connectorId` (string): ID of the connector
- **Returns**: Connector object with details

## MCP Tools

The MCP Dust Server provides tools for interacting with Dust's functionality. Each tool is identified by a name and can be executed using the MCP protocol.

### Workspace Tools

#### Create Workspace

- **Name**: `dust/workspace/create`
- **Description**: Create a new workspace
- **Parameters**:
  - `name` (string): Name of the workspace
  - `description` (string, optional): Description of the workspace
- **Returns**: Created workspace object

#### Update Workspace

- **Name**: `dust/workspace/update`
- **Description**: Update a workspace
- **Parameters**:
  - `workspaceId` (string): ID of the workspace
  - `name` (string, optional): New name of the workspace
  - `description` (string, optional): New description of the workspace
- **Returns**: Updated workspace object

#### Delete Workspace

- **Name**: `dust/workspace/delete`
- **Description**: Delete a workspace
- **Parameters**:
  - `workspaceId` (string): ID of the workspace
- **Returns**: Success status

### Agent Tools

#### Execute Agent

- **Name**: `dust/agent/execute`
- **Description**: Execute an agent
- **Parameters**:
  - `workspaceId` (string): ID of the workspace
  - `agentId` (string): ID of the agent
  - `input` (string): Input for the agent
  - `configId` (string, optional): ID of the agent configuration
- **Returns**: Agent run object

#### Get Agent Run

- **Name**: `dust/agent/run/get`
- **Description**: Get agent run by ID
- **Parameters**:
  - `workspaceId` (string): ID of the workspace
  - `agentId` (string): ID of the agent
  - `runId` (string): ID of the run
- **Returns**: Agent run object

#### List Agent Runs

- **Name**: `dust/agent/run/list`
- **Description**: List agent runs
- **Parameters**:
  - `workspaceId` (string): ID of the workspace
  - `agentId` (string): ID of the agent
- **Returns**: Array of agent run objects

### Knowledge Base Tools

#### Search Knowledge Base

- **Name**: `dust/knowledge/search`
- **Description**: Search a knowledge base
- **Parameters**:
  - `workspaceId` (string): ID of the workspace
  - `knowledgeBaseId` (string): ID of the knowledge base
  - `query` (string): Search query
  - `limit` (number, optional): Maximum number of results to return
- **Returns**: Search result object

#### Add Document

- **Name**: `dust/knowledge/document/add`
- **Description**: Add a document to a knowledge base
- **Parameters**:
  - `workspaceId` (string): ID of the workspace
  - `knowledgeBaseId` (string): ID of the knowledge base
  - `title` (string): Title of the document
  - `content` (string): Content of the document
  - `tags` (string[], optional): Tags for the document
  - `metadata` (object, optional): Metadata for the document
- **Returns**: Created document object

#### Update Document

- **Name**: `dust/knowledge/document/update`
- **Description**: Update a document
- **Parameters**:
  - `workspaceId` (string): ID of the workspace
  - `knowledgeBaseId` (string): ID of the knowledge base
  - `documentId` (string): ID of the document
  - `title` (string, optional): New title of the document
  - `content` (string, optional): New content of the document
  - `tags` (string[], optional): New tags for the document
  - `metadata` (object, optional): New metadata for the document
- **Returns**: Updated document object

### Connector Tools

#### Sync Connector

- **Name**: `dust/connector/sync`
- **Description**: Sync a connector
- **Parameters**:
  - `workspaceId` (string): ID of the workspace
  - `connectorId` (string): ID of the connector
- **Returns**: Connector sync object

#### Get Connector Sync

- **Name**: `dust/connector/sync/get`
- **Description**: Get connector sync by ID
- **Parameters**:
  - `workspaceId` (string): ID of the workspace
  - `connectorId` (string): ID of the connector
  - `syncId` (string): ID of the sync
- **Returns**: Connector sync object

## REST API Endpoints

In addition to the MCP protocol, the server also provides REST API endpoints for direct HTTP access.

### Authentication

#### Login

- **Endpoint**: `POST /api/v1/auth/login`
- **Description**: Authenticate with the server
- **Request Body**:
  ```json
  {
    "apiKey": "your-dust-api-key"
  }
  ```
- **Response**:
  ```json
  {
    "token": "jwt-token",
    "user": {
      "id": "user-id",
      "username": "username",
      "email": "user@example.com",
      "workspaceId": "workspace-id"
    }
  }
  ```

#### Refresh Token

- **Endpoint**: `POST /api/v1/auth/refresh`
- **Description**: Refresh an authentication token
- **Request Body**:
  ```json
  {
    "token": "current-jwt-token"
  }
  ```
- **Response**:
  ```json
  {
    "token": "new-jwt-token"
  }
  ```

#### Logout

- **Endpoint**: `POST /api/v1/auth/logout`
- **Description**: End the current session
- **Response**:
  ```json
  {
    "success": true
  }
  ```

### Server Status

- **Endpoint**: `GET /api/v1/status`
- **Description**: Get server status
- **Response**:
  ```json
  {
    "status": "operational",
    "version": "0.1.0",
    "workspace": "workspace-id",
    "agent": "agent-id",
    "uptime": 3600,
    "timestamp": "2023-06-01T12:00:00Z",
    "authenticated": true,
    "user": {
      "username": "username",
      "email": "user@example.com"
    }
  }
  ```

### Workspaces

#### List Workspaces

- **Endpoint**: `GET /api/v1/workspaces`
- **Description**: List workspaces
- **Response**:
  ```json
  {
    "workspaces": [
      {
        "id": "workspace-id",
        "name": "Workspace Name",
        "description": "Workspace Description",
        "createdAt": "2023-06-01T12:00:00Z",
        "updatedAt": "2023-06-01T12:00:00Z"
      }
    ]
  }
  ```

#### Get Workspace

- **Endpoint**: `GET /api/v1/workspaces/{workspaceId}`
- **Description**: Get workspace details
- **Parameters**:
  - `workspaceId` (path): ID of the workspace
- **Response**:
  ```json
  {
    "id": "workspace-id",
    "name": "Workspace Name",
    "description": "Workspace Description",
    "createdAt": "2023-06-01T12:00:00Z",
    "updatedAt": "2023-06-01T12:00:00Z"
  }
  ```

### Agents

#### List Agents

- **Endpoint**: `GET /api/v1/workspaces/{workspaceId}/agents`
- **Description**: List agents in a workspace
- **Parameters**:
  - `workspaceId` (path): ID of the workspace
- **Response**:
  ```json
  {
    "agents": [
      {
        "id": "agent-id",
        "name": "Agent Name",
        "description": "Agent Description",
        "createdAt": "2023-06-01T12:00:00Z",
        "updatedAt": "2023-06-01T12:00:00Z"
      }
    ]
  }
  ```

#### Get Agent

- **Endpoint**: `GET /api/v1/workspaces/{workspaceId}/agents/{agentId}`
- **Description**: Get agent details
- **Parameters**:
  - `workspaceId` (path): ID of the workspace
  - `agentId` (path): ID of the agent
- **Response**:
  ```json
  {
    "id": "agent-id",
    "name": "Agent Name",
    "description": "Agent Description",
    "createdAt": "2023-06-01T12:00:00Z",
    "updatedAt": "2023-06-01T12:00:00Z"
  }
  ```

#### Execute Agent

- **Endpoint**: `POST /api/v1/workspaces/{workspaceId}/agents/{agentId}/execute`
- **Description**: Execute an agent
- **Parameters**:
  - `workspaceId` (path): ID of the workspace
  - `agentId` (path): ID of the agent
- **Request Body**:
  ```json
  {
    "input": "Agent input",
    "configId": "config-id" // Optional
  }
  ```
- **Response**:
  ```json
  {
    "id": "run-id",
    "agentId": "agent-id",
    "workspaceId": "workspace-id",
    "status": "pending",
    "input": "Agent input",
    "createdAt": "2023-06-01T12:00:00Z",
    "updatedAt": "2023-06-01T12:00:00Z"
  }
  ```

## Authentication

The MCP Dust Server uses API key authentication. You need to provide a valid Dust API key to authenticate with the server.

### API Key Authentication

For REST API endpoints, you can authenticate using one of the following methods:

1. **HTTP Header**: Include the API key in the `X-Dust-API-Key` header
   ```
   X-Dust-API-Key: your-dust-api-key
   ```

2. **Query Parameter**: Include the API key as a query parameter
   ```
   ?api_key=your-dust-api-key
   ```

3. **Request Body**: Include the API key in the request body
   ```json
   {
     "apiKey": "your-dust-api-key"
   }
   ```

### JWT Authentication

After logging in, you can use the JWT token for subsequent requests:

```
Authorization: Bearer your-jwt-token
```

## Error Handling

The MCP Dust Server uses a consistent error format for all API responses:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Error message",
    "errorId": "unique-error-id",
    "details": {
      // Additional error details
    }
  }
}
```

### Common Error Codes

- `BAD_REQUEST` (400): Invalid request parameters
- `UNAUTHORIZED` (401): Authentication required
- `FORBIDDEN` (403): Permission denied
- `NOT_FOUND` (404): Resource not found
- `CONFLICT` (409): Resource conflict
- `RATE_LIMIT_EXCEEDED` (429): Rate limit exceeded
- `INTERNAL_SERVER_ERROR` (500): Server error

## Pagination

For endpoints that return lists of resources, pagination is supported using the following query parameters:

- `page`: Page number (1-based)
- `limit`: Number of items per page

Example:

```
GET /api/v1/workspaces?page=2&limit=10
```

Response:

```json
{
  "workspaces": [
    // Workspace objects
  ],
  "pagination": {
    "page": 2,
    "limit": 10,
    "totalItems": 25,
    "totalPages": 3
  }
}
```

## Rate Limiting

The MCP Dust Server implements rate limiting to prevent abuse. Rate limits are applied per API key and are reset hourly.

Rate limit headers are included in all API responses:

- `X-RateLimit-Limit`: Maximum number of requests allowed per hour
- `X-RateLimit-Remaining`: Number of requests remaining in the current hour
- `X-RateLimit-Reset`: Time when the rate limit will reset (Unix timestamp)

If you exceed the rate limit, you will receive a 429 Too Many Requests response.
