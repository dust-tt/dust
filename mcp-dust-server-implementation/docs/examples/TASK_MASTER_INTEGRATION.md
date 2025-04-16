# Task Master Integration with MCP Dust Server

This document provides examples and guidance for integrating Task Master with the MCP Dust Server.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Basic Usage](#basic-usage)
- [Advanced Usage](#advanced-usage)
- [Troubleshooting](#troubleshooting)

## Overview

[Task Master](https://github.com/eyaltoledano/claude-task-master) is a task management tool designed to work with AI assistants. When integrated with the MCP Dust Server, Task Master can:

1. Create and manage tasks
2. Execute Dust agents with task context
3. Track task progress
4. Organize work into sequential steps

The MCP Dust Server provides Task Master-specific tools that enable this integration.

## Prerequisites

Before you begin, ensure you have:

1. The MCP Dust Server running
2. A Dust API key
3. Access to a Dust workspace with agents
4. Node.js 18 or later

## Installation

### Install Task Master

Install Task Master globally:

```bash
npm install -g claude-task-master
```

### Verify Installation

Verify that Task Master is installed correctly:

```bash
task-master --version
```

You should see the Task Master version number.

## Configuration

### Configure Task Master to Use MCP Dust Server

Configure Task Master to use your MCP Dust Server:

```bash
task-master config set mcp.server http://localhost:5001
```

### Configure Authentication

Configure Task Master with your Dust API key:

```bash
task-master config set dust.apiKey your_dust_api_key
```

### Configure Default Workspace and Agent

Configure Task Master with your default workspace and agent:

```bash
task-master config set dust.workspaceId your_workspace_id
task-master config set dust.agentId your_agent_id
```

### Test the Configuration

Test the connection to the MCP Dust Server:

```bash
task-master test-connection
```

You should see a success message.

## Basic Usage

### Creating Tasks

Create a new task:

```bash
task-master create "Implement feature X" "Implement feature X with the following requirements: ..."
```

### Listing Tasks

List all tasks:

```bash
task-master list
```

List tasks with a specific status:

```bash
task-master list --status TODO
```

### Getting Task Details

Get details of a specific task:

```bash
task-master get 1
```

### Updating Task Status

Update a task's status:

```bash
task-master update 1 IN_PROGRESS
```

Possible status values:
- `TODO`
- `IN_PROGRESS`
- `DONE`
- `BLOCKED`

### Getting the Next Task

Get the next task to work on:

```bash
task-master next
```

### Executing an Agent with Task Context

Execute a Dust agent with task context:

```bash
task-master execute 1 "How should I implement feature X?"
```

This will:
1. Execute the Dust agent with the specified input
2. Include the task details as context
3. Return the agent's response

## Advanced Usage

### Using Task Master with MCP Protocol Directly

You can use the MCP protocol directly to interact with Task Master tools:

#### Listing Tasks

```bash
curl -X POST http://localhost:5001/stream \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Mcp-Session-Id: session-123" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "mcp.tool.execute",
    "params": {
      "name": "taskmaster/list",
      "parameters": {
        "status": "TODO"
      }
    },
    "id": 1
  }'
```

Response:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"tasks\":[{\"id\":1,\"title\":\"Implement feature X\",\"description\":\"Implement feature X with the following requirements: ...\",\"status\":\"TODO\",\"createdAt\":\"2023-01-01T00:00:00Z\",\"updatedAt\":\"2023-01-01T00:00:00Z\"}]}"
      }
    ]
  }
}
```

#### Getting a Task

```bash
curl -X POST http://localhost:5001/stream \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Mcp-Session-Id: session-123" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "mcp.tool.execute",
    "params": {
      "name": "taskmaster/get",
      "parameters": {
        "taskId": 1
      }
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
    "content": [
      {
        "type": "text",
        "text": "{\"id\":1,\"title\":\"Implement feature X\",\"description\":\"Implement feature X with the following requirements: ...\",\"status\":\"TODO\",\"createdAt\":\"2023-01-01T00:00:00Z\",\"updatedAt\":\"2023-01-01T00:00:00Z\"}"
      }
    ]
  }
}
```

#### Updating a Task

```bash
curl -X POST http://localhost:5001/stream \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Mcp-Session-Id: session-123" \
  -H "Content-Type: application/json" \
  -d '{
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
        "text": "{\"id\":1,\"title\":\"Implement feature X\",\"description\":\"Implement feature X with the following requirements: ...\",\"status\":\"IN_PROGRESS\",\"createdAt\":\"2023-01-01T00:00:00Z\",\"updatedAt\":\"2023-01-02T00:00:00Z\"}"
      }
    ]
  }
}
```

#### Getting the Next Task

```bash
curl -X POST http://localhost:5001/stream \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Mcp-Session-Id: session-123" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "mcp.tool.execute",
    "params": {
      "name": "taskmaster/next",
      "parameters": {}
    },
    "id": 4
  }'
```

Response:

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"id\":1,\"title\":\"Implement feature X\",\"description\":\"Implement feature X with the following requirements: ...\",\"status\":\"TODO\",\"createdAt\":\"2023-01-01T00:00:00Z\",\"updatedAt\":\"2023-01-01T00:00:00Z\"}"
      }
    ]
  }
}
```

### Executing an Agent with Task Context

You can execute a Dust agent with task context using the MCP protocol:

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
        "input": "How should I implement feature X?",
        "taskId": 1
      }
    },
    "id": 5
  }'
```

Response:

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"id\":\"run-123\",\"agentId\":\"agent-123\",\"workspaceId\":\"workspace-123\",\"status\":\"completed\",\"input\":\"How should I implement feature X?\",\"output\":\"To implement feature X, you should...\",\"taskId\":1,\"createdAt\":\"2023-01-01T00:00:00Z\",\"completedAt\":\"2023-01-01T00:00:01Z\"}"
      }
    ]
  }
}
```

### Using the REST API

You can also use the REST API to interact with Task Master:

#### Listing Tasks

```bash
curl -X GET http://localhost:5001/api/v1/tasks \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

Response:

```json
{
  "tasks": [
    {
      "id": 1,
      "title": "Implement feature X",
      "description": "Implement feature X with the following requirements: ...",
      "status": "TODO",
      "createdAt": "2023-01-01T00:00:00Z",
      "updatedAt": "2023-01-01T00:00:00Z"
    },
    {
      "id": 2,
      "title": "Fix bug Y",
      "description": "Fix bug Y that occurs when...",
      "status": "IN_PROGRESS",
      "createdAt": "2023-01-02T00:00:00Z",
      "updatedAt": "2023-01-02T00:00:00Z"
    }
  ]
}
```

#### Getting a Task

```bash
curl -X GET http://localhost:5001/api/v1/tasks/1 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

Response:

```json
{
  "id": 1,
  "title": "Implement feature X",
  "description": "Implement feature X with the following requirements: ...",
  "status": "TODO",
  "createdAt": "2023-01-01T00:00:00Z",
  "updatedAt": "2023-01-01T00:00:00Z"
}
```

#### Updating a Task

```bash
curl -X PATCH http://localhost:5001/api/v1/tasks/1 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{"status": "IN_PROGRESS"}'
```

Response:

```json
{
  "id": 1,
  "title": "Implement feature X",
  "description": "Implement feature X with the following requirements: ...",
  "status": "IN_PROGRESS",
  "createdAt": "2023-01-01T00:00:00Z",
  "updatedAt": "2023-01-02T00:00:00Z"
}
```

#### Getting the Next Task

```bash
curl -X GET http://localhost:5001/api/v1/tasks/next \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

Response:

```json
{
  "id": 1,
  "title": "Implement feature X",
  "description": "Implement feature X with the following requirements: ...",
  "status": "TODO",
  "createdAt": "2023-01-01T00:00:00Z",
  "updatedAt": "2023-01-01T00:00:00Z"
}
```

## Troubleshooting

### Common Issues

#### Connection Issues

If Task Master can't connect to the MCP Dust Server:

1. Verify that the MCP Dust Server is running
2. Check that the server URL is correct
3. Ensure that your API key is valid
4. Check for any network issues

#### Authentication Issues

If Task Master can't authenticate with the MCP Dust Server:

1. Verify that your API key is correct
2. Check that your API key has the necessary permissions
3. Try regenerating your API key

#### Task Master Command Issues

If Task Master commands are failing:

1. Check that Task Master is installed correctly
2. Verify that you're using the correct command syntax
3. Check for any error messages
4. Try updating Task Master to the latest version

### Getting Help

If you're still experiencing issues:

1. Check the [Task Master documentation](https://github.com/eyaltoledano/claude-task-master)
2. Check the [MCP Dust Server documentation](../README.md)
3. Open an issue on the [Task Master GitHub repository](https://github.com/eyaltoledano/claude-task-master/issues)
4. Open an issue on the [MCP Dust Server GitHub repository](https://github.com/your-org/mcp-dust-server/issues)
