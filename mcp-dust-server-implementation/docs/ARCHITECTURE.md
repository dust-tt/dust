# MCP Dust Server Architecture

This document provides a detailed overview of the MCP Dust Server architecture, including component descriptions, data flow, and design decisions.

## Table of Contents

- [System Overview](#system-overview)
- [Component Architecture](#component-architecture)
- [Data Flow](#data-flow)
- [Design Decisions](#design-decisions)
- [Security Considerations](#security-considerations)
- [Performance Considerations](#performance-considerations)
- [Scalability Considerations](#scalability-considerations)

## System Overview

The MCP Dust Server is a bridge between MCP clients (such as Task Master) and the Dust API. It implements the Model Context Protocol (MCP) specification, allowing clients to interact with Dust's AI capabilities through a standardized interface.

### High-Level Architecture

```
+-------------------+     +-------------------+     +-------------------+
|                   |     |                   |     |                   |
|   MCP Client      |<--->|   MCP Server     |<--->|   Dust API        |
|   (Task Master)   |     |   (This Project) |     |                   |
|                   |     |                   |     |                   |
+-------------------+     +-------------------+     +-------------------+
                                    ^
                                    |
                          +---------+---------+
                          |                   |
                          |  Authentication   |
                          |  & Permissions    |
                          |                   |
                          +-------------------+
```

### Key Features

1. **MCP Protocol Implementation**: Implements the Model Context Protocol specification
2. **Dust API Integration**: Provides a client for interacting with the Dust API
3. **Authentication and Authorization**: Handles API key validation and permission checking
4. **Resource Hierarchy**: Organizes Dust resources in a hierarchical structure
5. **Event System**: Connects Dust events with MCP notifications
6. **Error Handling**: Provides comprehensive error handling and logging
7. **Documentation**: Includes detailed API and architecture documentation

## Component Architecture

The MCP Dust Server is composed of several key components, each with a specific responsibility:

### Core MCP Server

The core MCP server component implements the Model Context Protocol specification. It handles MCP requests, manages sessions, and provides the MCP transport layer.

**Key Classes**:
- `MCPServer`: Main server class that implements the MCP protocol
- `MCPSession`: Represents a client session
- `MCPResource`: Represents a resource in the MCP protocol
- `MCPTool`: Represents a tool in the MCP protocol

### Dust Service

The Dust Service component provides a client for interacting with the Dust API. It handles authentication, API requests, and response parsing.

**Key Classes**:
- `DustService`: Main service class for interacting with the Dust API
- `DustClient`: HTTP client for making requests to the Dust API
- `DustAuthenticator`: Handles authentication with the Dust API

### Authentication System

The Authentication System component handles API key validation, session management, and token generation.

**Key Classes**:
- `AuthService`: Main service class for authentication
- `AuthMiddleware`: Express middleware for authenticating requests
- `TokenManager`: Handles JWT token generation and validation

### Permission Proxy

The Permission Proxy component manages access control for resources and tools. It checks if a user has permission to access a resource or execute a tool.

**Key Classes**:
- `PermissionProxy`: Main class for checking permissions
- `PermissionCache`: Caches permission check results for performance
- `PermissionChecker`: Checks if a user has permission to access a resource or execute a tool

### Resource Hierarchy

The Resource Hierarchy component organizes Dust resources in a hierarchical structure. It provides a way to navigate and access resources using URIs.

**Key Classes**:
- `ResourceHierarchy`: Main class for managing the resource hierarchy
- `ResourceNode`: Represents a node in the resource hierarchy
- `ResourceProvider`: Provides resources to the MCP server

### Event Bridge

The Event Bridge component connects Dust events with MCP notifications. It subscribes to Dust events and converts them to MCP notifications.

**Key Classes**:
- `EventBridge`: Main class for bridging events between Dust and MCP
- `EventSubscriber`: Subscribes to Dust events
- `NotificationSender`: Sends notifications to MCP clients

### API Reflection Layer

The API Reflection Layer component maps Dust's API to MCP resources and tools. It analyzes the Dust API and creates corresponding MCP resources and tools.

**Key Classes**:
- `DustApiReflector`: Main class for reflecting the Dust API
- `ResourceMapper`: Maps Dust resources to MCP resources
- `ToolMapper`: Maps Dust operations to MCP tools

## Data Flow

The data flow through the MCP Dust Server follows these steps:

1. **Client Request**: An MCP client sends a request to the server
2. **Authentication**: The server authenticates the request using the provided API key
3. **Permission Check**: The server checks if the user has permission to access the requested resource or execute the requested tool
4. **Resource/Tool Execution**: The server executes the requested resource or tool
5. **Dust API Interaction**: If necessary, the server interacts with the Dust API
6. **Response Generation**: The server generates a response based on the Dust API response
7. **Client Response**: The server sends the response back to the client

### Request Flow Diagram

```
+-------------+     +----------------+     +----------------+     +----------------+
|             |     |                |     |                |     |                |
| MCP Client  |---->| Authentication |---->| Permission    |---->| Resource/Tool  |
|             |     | Middleware     |     | Proxy         |     | Execution      |
|             |     |                |     |                |     |                |
+-------------+     +----------------+     +----------------+     +----------------+
                                                                         |
                                                                         v
+-------------+     +----------------+     +----------------+     +----------------+
|             |     |                |     |                |     |                |
| MCP Client  |<----| Response       |<----| Response       |<----| Dust API      |
|             |     | Generation     |     | Processing     |     | Interaction   |
|             |     |                |     |                |     |                |
+-------------+     +----------------+     +----------------+     +----------------+
```

## Design Decisions

### TypeScript

The MCP Dust Server is implemented in TypeScript to provide type safety and better developer experience. TypeScript helps catch errors at compile time and provides better tooling support.

### Express.js

Express.js is used as the web framework for the MCP Dust Server. It provides a simple and flexible way to handle HTTP requests and middleware.

### Modular Architecture

The MCP Dust Server uses a modular architecture to separate concerns and make the codebase more maintainable. Each component has a specific responsibility and can be tested independently.

### Dependency Injection

Dependency injection is used to provide dependencies to components. This makes the code more testable and allows for easier mocking of dependencies.

### Caching

Caching is used to improve performance for frequently accessed data, such as permission checks and resource metadata.

### Error Handling

Comprehensive error handling is implemented to provide meaningful error messages and proper error codes. Errors are logged with context information for easier debugging.

## Security Considerations

### API Key Security

API keys are sensitive information and should be handled securely. The MCP Dust Server never logs API keys and uses secure storage for tokens.

### Authentication

All requests to the MCP Dust Server require authentication. The server supports API key authentication and JWT tokens for session management.

### Authorization

The Permission Proxy component checks if a user has permission to access a resource or execute a tool. This ensures that users can only access resources and tools they have permission to use.

### Input Validation

All input from clients is validated to prevent injection attacks and other security issues.

### Rate Limiting

Rate limiting is implemented to prevent abuse of the API. Rate limits are applied per API key and are reset hourly.

## Performance Considerations

### Caching

Caching is used to improve performance for frequently accessed data. The Permission Proxy caches permission check results, and the Resource Hierarchy caches resource metadata.

### Connection Pooling

Connection pooling is used for HTTP requests to the Dust API to reduce connection overhead.

### Asynchronous Processing

Asynchronous processing is used for long-running operations, such as agent execution and connector syncing. This allows the server to handle multiple requests concurrently.

### Pagination

Pagination is implemented for endpoints that return lists of resources to reduce response size and improve performance.

## Scalability Considerations

### Stateless Design

The MCP Dust Server is designed to be stateless, allowing for horizontal scaling. Session state is stored in a distributed cache, and no state is stored in memory.

### Load Balancing

The server can be deployed behind a load balancer to distribute traffic across multiple instances.

### Microservices Architecture

The modular architecture of the MCP Dust Server allows for future migration to a microservices architecture if needed.

### Monitoring and Metrics

The server includes monitoring and metrics to track performance and identify bottlenecks. This information can be used to optimize the server and plan for scaling.
