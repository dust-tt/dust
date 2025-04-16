# MCP Dust Server Authentication Guide

This guide explains the authentication mechanisms used by the MCP Dust Server and how to implement authentication in your MCP clients.

## Table of Contents

- [Authentication Overview](#authentication-overview)
- [Authentication Flow](#authentication-flow)
- [API Key Authentication](#api-key-authentication)
- [JWT Token Authentication](#jwt-token-authentication)
- [Session Management](#session-management)
- [Permission Model](#permission-model)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)

## Authentication Overview

The MCP Dust Server uses a multi-layered authentication system:

1. **API Key Authentication**: Initial authentication using Dust API keys
2. **JWT Token Authentication**: Subsequent requests use JWT tokens
3. **Session Management**: MCP sessions for stateful connections
4. **Permission Checking**: Fine-grained access control for resources and tools

This approach provides a secure and flexible authentication system that integrates with Dust's existing authentication mechanisms while providing the stateful session management required by the MCP protocol.

## Authentication Flow

The typical authentication flow is as follows:

1. **Login**: Client provides a Dust API key to the `/api/v1/auth/login` endpoint
2. **Token Generation**: Server validates the API key with Dust and generates a JWT token
3. **Session Creation**: Client creates an MCP session using the JWT token
4. **Request Authentication**: Subsequent requests include the JWT token and session ID
5. **Permission Checking**: Server checks permissions for each resource and tool access

## API Key Authentication

### Obtaining a Dust API Key

To obtain a Dust API key:

1. Log in to your Dust account
2. Navigate to your account settings
3. Generate a new API key with appropriate permissions

### Authenticating with an API Key

To authenticate with an API key, make a POST request to the `/api/v1/auth/login` endpoint:

```bash
curl -X POST http://localhost:5001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "your_dust_api_key"}'
```

The response will include a JWT token and user information:

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

## JWT Token Authentication

### JWT Token Structure

The JWT token contains the following claims:

- `userId`: The user's ID
- `username`: The user's username
- `email`: The user's email
- `workspaceId`: The user's primary workspace ID
- `permissions`: The user's permissions
- `iat`: Issued at timestamp
- `exp`: Expiration timestamp

### Using JWT Tokens

For REST API requests, include the JWT token in the `Authorization` header:

```bash
curl -X GET http://localhost:5001/api/v1/workspaces \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

For MCP requests, include the JWT token in the `Authorization` header:

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

### Token Expiration and Refresh

JWT tokens expire after a configurable period (default: 1 hour). To refresh a token, make a POST request to the `/api/v1/auth/refresh` endpoint:

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

## Session Management

### Creating an MCP Session

To create an MCP session, make a POST request to the `/stream` endpoint:

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

The response will include a session ID:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "sessionId": "session-123"
  }
}
```

### Using an MCP Session

For subsequent MCP requests, include the session ID in the `Mcp-Session-Id` header:

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

### Session Expiration

MCP sessions expire after a configurable period of inactivity (default: 1 hour). When a session expires, the client must create a new session.

## Permission Model

The MCP Dust Server uses a permission model based on Dust's permission system. Permissions are included in the JWT token and checked for each resource and tool access.

### Permission Types

The following permission types are supported:

- `read:workspaces`: Read access to workspaces
- `write:workspaces`: Write access to workspaces
- `read:agents`: Read access to agents
- `write:agents`: Write access to agents
- `execute:agents`: Execute agents
- `read:knowledge-bases`: Read access to knowledge bases
- `write:knowledge-bases`: Write access to knowledge bases
- `read:connectors`: Read access to connectors
- `write:connectors`: Write access to connectors
- `execute:connectors`: Execute connectors

### Permission Checking

Permissions are checked at multiple levels:

1. **Resource Level**: Permissions are checked when accessing resources
2. **Tool Level**: Permissions are checked when executing tools
3. **Operation Level**: Permissions are checked for specific operations

## Security Considerations

### API Key Security

API keys should be treated as sensitive information and never exposed to clients. The MCP Dust Server should be deployed in a secure environment with appropriate access controls.

### JWT Token Security

JWT tokens should be transmitted over HTTPS to prevent interception. The `SECURITY_SECRET_KEY` environment variable should be a strong, random string that is kept secret.

### Session Security

MCP sessions are tied to the JWT token used to create them. If a JWT token is compromised, all sessions created with that token should be invalidated.

## Troubleshooting

### Common Authentication Issues

#### Invalid API Key

If you receive a 401 Unauthorized response when logging in, check that your API key is valid and has the necessary permissions.

#### Expired JWT Token

If you receive a 401 Unauthorized response when making a request, your JWT token may have expired. Try refreshing the token.

#### Invalid Session ID

If you receive a SESSION_NOT_FOUND error when making an MCP request, your session may have expired or been invalidated. Try creating a new session.

### Debugging Authentication

To debug authentication issues, you can enable request and response logging:

```env
LOG_LEVEL=debug
LOG_REQUEST_HEADERS=true
LOG_RESPONSE_HEADERS=true
```

This will log the request and response headers, which can help identify authentication issues.
