# MCP Dust Server REST API Reference

This document provides a comprehensive reference for the REST API exposed by the MCP Dust Server.

## Table of Contents

- [API Overview](#api-overview)
- [Authentication](#authentication)
- [Error Handling](#error-handling)
- [API Endpoints](#api-endpoints)
  - [Authentication Endpoints](#authentication-endpoints)
  - [Workspace Endpoints](#workspace-endpoints)
  - [Agent Endpoints](#agent-endpoints)
  - [Knowledge Base Endpoints](#knowledge-base-endpoints)
  - [Connector Endpoints](#connector-endpoints)
  - [Task Master Endpoints](#task-master-endpoints)
- [Pagination](#pagination)
- [Rate Limiting](#rate-limiting)
- [Examples](#examples)

## API Overview

The MCP Dust Server provides a REST API that allows clients to interact with the Dust platform's capabilities. The API is organized into endpoints that correspond to different resource types and operations.

The base URL for the API is:

```
http://localhost:5001/api/v1
```

All API requests should include an `Authorization` header with a JWT token:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Authentication

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

### Refreshing a Token

To refresh a JWT token, make a POST request to the `/api/v1/auth/refresh` endpoint:

```bash
curl -X POST http://localhost:5001/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}'
```

The response will include a new JWT token:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Logging Out

To log out and invalidate a JWT token, make a POST request to the `/api/v1/auth/logout` endpoint:

```bash
curl -X POST http://localhost:5001/api/v1/auth/logout \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

The response will have a 204 No Content status code.

## Error Handling

The API uses standard HTTP status codes to indicate the success or failure of a request:

- `200 OK`: The request was successful
- `201 Created`: The resource was created successfully
- `204 No Content`: The request was successful, but there is no content to return
- `400 Bad Request`: The request was invalid
- `401 Unauthorized`: Authentication is required or failed
- `403 Forbidden`: The authenticated user does not have permission to access the resource
- `404 Not Found`: The requested resource was not found
- `429 Too Many Requests`: The client has sent too many requests in a given amount of time
- `500 Internal Server Error`: An error occurred on the server

Error responses include a JSON object with details about the error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": {
      "field": "apiKey",
      "message": "API key is required"
    },
    "severity": "LOW"
  }
}
```

## API Endpoints

### Authentication Endpoints

#### POST /api/v1/auth/login

Authenticates a user with a Dust API key and returns a JWT token.

**Request**:

```json
{
  "apiKey": "your_dust_api_key"
}
```

**Response**:

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

#### POST /api/v1/auth/refresh

Refreshes a JWT token.

**Request**:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response**:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### POST /api/v1/auth/logout

Logs out a user and invalidates their JWT token.

**Request**:

No request body is required.

**Response**:

204 No Content

### Workspace Endpoints

#### GET /api/v1/workspaces

Gets a list of workspaces.

**Response**:

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

#### GET /api/v1/workspaces/{workspaceId}

Gets a specific workspace.

**Response**:

```json
{
  "id": "workspace-123",
  "name": "Workspace 1",
  "description": "Description of Workspace 1",
  "createdAt": "2023-01-01T00:00:00Z",
  "updatedAt": "2023-01-02T00:00:00Z"
}
```

### Agent Endpoints

#### GET /api/v1/workspaces/{workspaceId}/agents

Gets a list of agents in a workspace.

**Response**:

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

#### GET /api/v1/workspaces/{workspaceId}/agents/{agentId}

Gets a specific agent.

**Response**:

```json
{
  "id": "agent-123",
  "name": "Agent 1",
  "description": "Description of Agent 1",
  "workspaceId": "workspace-123",
  "createdAt": "2023-01-01T00:00:00Z",
  "updatedAt": "2023-01-02T00:00:00Z"
}
```

#### POST /api/v1/workspaces/{workspaceId}/agents/{agentId}/execute

Executes an agent.

**Request**:

```json
{
  "input": "Hello, agent!",
  "taskId": "task-123"
}
```

**Response**:

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

#### GET /api/v1/workspaces/{workspaceId}/agents/{agentId}/runs

Gets a list of runs for an agent.

**Response**:

```json
{
  "runs": [
    {
      "id": "run-123",
      "agentId": "agent-123",
      "workspaceId": "workspace-123",
      "status": "completed",
      "input": "Hello, agent!",
      "output": "Hello, human!",
      "createdAt": "2023-01-01T00:00:00Z",
      "completedAt": "2023-01-01T00:00:01Z"
    },
    {
      "id": "run-456",
      "agentId": "agent-123",
      "workspaceId": "workspace-123",
      "status": "completed",
      "input": "How are you?",
      "output": "I'm doing well, thank you!",
      "createdAt": "2023-01-02T00:00:00Z",
      "completedAt": "2023-01-02T00:00:01Z"
    }
  ]
}
```

#### GET /api/v1/workspaces/{workspaceId}/agents/{agentId}/runs/{runId}

Gets a specific run.

**Response**:

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

### Knowledge Base Endpoints

#### GET /api/v1/workspaces/{workspaceId}/knowledge-bases

Gets a list of knowledge bases in a workspace.

**Response**:

```json
{
  "knowledgeBases": [
    {
      "id": "kb-123",
      "name": "Knowledge Base 1",
      "description": "Description of Knowledge Base 1",
      "workspaceId": "workspace-123",
      "createdAt": "2023-01-01T00:00:00Z",
      "updatedAt": "2023-01-02T00:00:00Z"
    },
    {
      "id": "kb-456",
      "name": "Knowledge Base 2",
      "description": "Description of Knowledge Base 2",
      "workspaceId": "workspace-123",
      "createdAt": "2023-01-03T00:00:00Z",
      "updatedAt": "2023-01-04T00:00:00Z"
    }
  ]
}
```

#### GET /api/v1/workspaces/{workspaceId}/knowledge-bases/{knowledgeBaseId}

Gets a specific knowledge base.

**Response**:

```json
{
  "id": "kb-123",
  "name": "Knowledge Base 1",
  "description": "Description of Knowledge Base 1",
  "workspaceId": "workspace-123",
  "createdAt": "2023-01-01T00:00:00Z",
  "updatedAt": "2023-01-02T00:00:00Z"
}
```

#### POST /api/v1/workspaces/{workspaceId}/knowledge-bases/{knowledgeBaseId}/search

Searches a knowledge base.

**Request**:

```json
{
  "query": "example query",
  "limit": 10
}
```

**Response**:

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

#### GET /api/v1/workspaces/{workspaceId}/knowledge-bases/{knowledgeBaseId}/documents

Gets a list of documents in a knowledge base.

**Response**:

```json
{
  "documents": [
    {
      "id": "doc-123",
      "title": "Document 1",
      "content": "Content of Document 1",
      "knowledgeBaseId": "kb-123",
      "workspaceId": "workspace-123",
      "createdAt": "2023-01-01T00:00:00Z",
      "updatedAt": "2023-01-02T00:00:00Z"
    },
    {
      "id": "doc-456",
      "title": "Document 2",
      "content": "Content of Document 2",
      "knowledgeBaseId": "kb-123",
      "workspaceId": "workspace-123",
      "createdAt": "2023-01-03T00:00:00Z",
      "updatedAt": "2023-01-04T00:00:00Z"
    }
  ]
}
```

#### GET /api/v1/workspaces/{workspaceId}/knowledge-bases/{knowledgeBaseId}/documents/{documentId}

Gets a specific document.

**Response**:

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

### Connector Endpoints

#### GET /api/v1/workspaces/{workspaceId}/connectors

Gets a list of connectors in a workspace.

**Response**:

```json
{
  "connectors": [
    {
      "id": "connector-123",
      "name": "Connector 1",
      "type": "github",
      "workspaceId": "workspace-123",
      "createdAt": "2023-01-01T00:00:00Z",
      "updatedAt": "2023-01-02T00:00:00Z"
    },
    {
      "id": "connector-456",
      "name": "Connector 2",
      "type": "slack",
      "workspaceId": "workspace-123",
      "createdAt": "2023-01-03T00:00:00Z",
      "updatedAt": "2023-01-04T00:00:00Z"
    }
  ]
}
```

#### GET /api/v1/workspaces/{workspaceId}/connectors/{connectorId}

Gets a specific connector.

**Response**:

```json
{
  "id": "connector-123",
  "name": "Connector 1",
  "type": "github",
  "workspaceId": "workspace-123",
  "createdAt": "2023-01-01T00:00:00Z",
  "updatedAt": "2023-01-02T00:00:00Z"
}
```

#### POST /api/v1/workspaces/{workspaceId}/connectors/{connectorId}/sync

Syncs a connector.

**Response**:

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

#### GET /api/v1/workspaces/{workspaceId}/connectors/{connectorId}/syncs

Gets a list of syncs for a connector.

**Response**:

```json
{
  "syncs": [
    {
      "id": "sync-123",
      "connectorId": "connector-123",
      "workspaceId": "workspace-123",
      "status": "completed",
      "startedAt": "2023-01-01T00:00:00Z",
      "completedAt": "2023-01-01T00:00:01Z"
    },
    {
      "id": "sync-456",
      "connectorId": "connector-123",
      "workspaceId": "workspace-123",
      "status": "completed",
      "startedAt": "2023-01-02T00:00:00Z",
      "completedAt": "2023-01-02T00:00:01Z"
    }
  ]
}
```

#### GET /api/v1/workspaces/{workspaceId}/connectors/{connectorId}/syncs/{syncId}

Gets a specific sync.

**Response**:

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

### Task Master Endpoints

#### GET /api/v1/tasks

Gets a list of Task Master tasks.

**Query Parameters**:

- `status`: Filter tasks by status (TODO, IN_PROGRESS, DONE, BLOCKED)

**Response**:

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

#### GET /api/v1/tasks/{taskId}

Gets a specific Task Master task.

**Response**:

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

#### PATCH /api/v1/tasks/{taskId}

Updates a Task Master task.

**Request**:

```json
{
  "status": "IN_PROGRESS"
}
```

**Response**:

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

#### GET /api/v1/tasks/next

Gets the next Task Master task to work on.

**Response**:

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

## Pagination

Some endpoints that return lists of resources support pagination using the following query parameters:

- `page`: The page number (default: 1)
- `limit`: The number of items per page (default: 10, max: 100)

Paginated responses include pagination metadata:

```json
{
  "items": [...],
  "pagination": {
    "page": 1,
    "limit": 10,
    "totalItems": 25,
    "totalPages": 3
  }
}
```

## Rate Limiting

The API implements rate limiting to prevent abuse. Rate limits are applied per client IP address and are reset every hour.

Rate limit information is included in the response headers:

- `X-RateLimit-Limit`: The maximum number of requests allowed per hour
- `X-RateLimit-Remaining`: The number of requests remaining in the current hour
- `X-RateLimit-Reset`: The time at which the rate limit will reset, in Unix epoch seconds

If you exceed the rate limit, you will receive a 429 Too Many Requests response.

## Examples

### Authenticating with an API Key

```bash
curl -X POST http://localhost:5001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "your_dust_api_key"}'
```

### Getting a List of Workspaces

```bash
curl -X GET http://localhost:5001/api/v1/workspaces \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Executing an Agent

```bash
curl -X POST http://localhost:5001/api/v1/workspaces/workspace-123/agents/agent-123/execute \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{"input": "Hello, agent!"}'
```

### Searching a Knowledge Base

```bash
curl -X POST http://localhost:5001/api/v1/workspaces/workspace-123/knowledge-bases/kb-123/search \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{"query": "example query"}'
```

### Updating a Task Master Task

```bash
curl -X PATCH http://localhost:5001/api/v1/tasks/1 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{"status": "IN_PROGRESS"}'
```
