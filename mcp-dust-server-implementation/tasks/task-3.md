# Task 3: Implement Core MCP Server Structure

## Description
Implement the core structure of the MCP server based on the mcp-dust-server repository.

## Status
TODO

## Priority
HIGH

## Dependencies
1. Set Up Project Repository
2. Configure Environment and Dependencies

## Subtasks
1. Create the main server.js file with Express setup
2. Implement the MCPServer class with basic functionality
3. Set up SSE and HTTP Stream endpoints
4. Implement health check endpoints
5. Create basic error handling middleware
6. Set up server startup and shutdown procedures

## Implementation Details
For this task, we need to implement the core structure of our MCP server based on the mcp-dust-server repository.

### 1. Create the Main Server File
Create a `src/server.ts` file that:
- Sets up an Express application
- Creates an HTTP server
- Configures middleware (CORS, JSON parsing, etc.)
- Sets up routes for SSE and HTTP Stream endpoints
- Implements health check endpoints
- Handles graceful shutdown

Example:
```typescript
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { MCPServer } from './types/server';
import { DustService } from './services/dustService';
import { config } from './config';
import { logger } from './utils/logger';

// Create Express app and HTTP server
const app = express();
const httpServer = createServer(app);

// Configure middleware
app.use(express.json());
app.use(cors({
  origin: config.cors.allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Dust-API-Key'],
}));

// Initialize Dust service
const dustService = new DustService({
  apiKey: config.dust.apiKey,
  workspaceId: config.dust.workspaceId,
  agentId: config.dust.agentId,
  userContext: {
    username: config.dust.username,
    email: config.dust.email,
    fullName: config.dust.fullName,
    timezone: config.dust.timezone,
  },
});

// Create MCP server
const mcpServer = new MCPServer({
  name: config.mcp.name,
  dustService,
  timeout: config.mcp.timeout * 1000,
});

// Set up SSE endpoint
app.post('/sse', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  mcpServer.handleSSEConnection(req, res);
});

// Set up HTTP Stream endpoint
app.post('/stream', (req, res) => {
  mcpServer.handleStreamConnection(req, res);
});

// Add health check endpoints
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Start the server
httpServer.listen(config.mcp.port, config.mcp.host, () => {
  logger.info(`MCP Server running on http://${config.mcp.host}:${config.mcp.port}`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down gracefully...');
  httpServer.close(() => {
    process.exit(0);
  });
});
```

### 2. Implement the MCPServer Class
Create a `src/types/server.ts` file that defines the MCPServer interface and implements the basic functionality:
- Session management
- Event handling
- SSE and HTTP Stream connection handling
- Message processing

### 3. Set Up SSE and HTTP Stream Endpoints
Implement the SSE and HTTP Stream endpoints in the MCPServer class:
- SSE for real-time updates
- HTTP Stream for request/response patterns
- Handle connection establishment and termination
- Implement message serialization and deserialization

### 4. Implement Health Check Endpoints
Create health check endpoints:
- `/health` for basic health checks
- `/ready` for readiness checks
- `/live` for liveness checks

### 5. Create Error Handling Middleware
Implement error handling middleware:
- Catch and log errors
- Return appropriate HTTP status codes
- Provide helpful error messages
- Handle different types of errors (validation, authentication, etc.)

### 6. Set Up Server Startup and Shutdown
Implement server startup and shutdown procedures:
- Initialize services and connections
- Handle graceful shutdown on SIGINT and SIGTERM
- Close connections and release resources
- Log startup and shutdown events

## Test Strategy
- Verify that the server starts and listens on the configured port
- Test SSE and HTTP Stream endpoints with simple clients
- Ensure that health check endpoints return the expected responses
- Test error handling with various error scenarios
- Verify that graceful shutdown works correctly
