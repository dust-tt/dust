# MCP Dust Server Troubleshooting Guide

This guide provides solutions for common issues you might encounter when running the MCP Dust Server.

## Table of Contents

- [Common Issues](#common-issues)
  - [Server Won't Start](#server-wont-start)
  - [Authentication Issues](#authentication-issues)
  - [MCP Protocol Issues](#mcp-protocol-issues)
  - [Dust API Integration Issues](#dust-api-integration-issues)
  - [Performance Issues](#performance-issues)
- [Debugging Techniques](#debugging-techniques)
  - [Enabling Debug Logging](#enabling-debug-logging)
  - [Inspecting Network Traffic](#inspecting-network-traffic)
  - [Monitoring Resource Usage](#monitoring-resource-usage)
- [Error Codes](#error-codes)
  - [HTTP Error Codes](#http-error-codes)
  - [MCP Error Codes](#mcp-error-codes)
  - [Dust API Error Codes](#dust-api-error-codes)
- [Getting Help](#getting-help)

## Common Issues

### Server Won't Start

#### Missing Environment Variables

**Symptoms**: Server fails to start with an error about missing environment variables.

**Solution**:
1. Check that you have created a `.env` file with all required variables.
2. Verify that the `.env` file is in the correct location (project root).
3. Ensure that all required variables are set:
   - `DUST_API_KEY`
   - `DUST_WORKSPACE_ID`
   - `DUST_AGENT_ID`
   - `SECURITY_SECRET_KEY`

#### Port Already in Use

**Symptoms**: Server fails to start with an error like "EADDRINUSE: address already in use".

**Solution**:
1. Check if another process is using the same port:
   ```bash
   # Linux/macOS
   lsof -i :5001
   
   # Windows
   netstat -ano | findstr :5001
   ```
2. Stop the process or change the port in your `.env` file:
   ```
   MCP_SERVER_PORT=5002
   ```

#### Node.js Version Issues

**Symptoms**: Server fails to start with syntax errors or unsupported features.

**Solution**:
1. Check your Node.js version:
   ```bash
   node --version
   ```
2. Ensure you're using Node.js 18.x or higher.
3. If needed, install a compatible version using a version manager like nvm.

### Authentication Issues

#### Invalid API Key

**Symptoms**: Authentication fails with a 401 Unauthorized response.

**Solution**:
1. Verify that your Dust API key is correct.
2. Check that the API key has the necessary permissions.
3. Try generating a new API key in the Dust platform.

#### JWT Token Issues

**Symptoms**: Requests fail with a 401 Unauthorized response after initial authentication.

**Solution**:
1. Check that the JWT token is included in the `Authorization` header.
2. Verify that the token hasn't expired.
3. Try refreshing the token using the `/api/v1/auth/refresh` endpoint.
4. Ensure that `SECURITY_SECRET_KEY` hasn't changed since the token was issued.

#### Session Issues

**Symptoms**: MCP requests fail with a SESSION_NOT_FOUND error.

**Solution**:
1. Check that the session ID is included in the `Mcp-Session-Id` header.
2. Verify that the session hasn't expired.
3. Try creating a new session using the `mcp.session.create` method.

### MCP Protocol Issues

#### Invalid JSON-RPC Request

**Symptoms**: Requests fail with an "Invalid Request" error.

**Solution**:
1. Ensure that the request follows the JSON-RPC 2.0 specification.
2. Check that the request includes the required fields:
   - `jsonrpc`: Must be "2.0"
   - `method`: The method to call
   - `params`: The parameters for the method
   - `id`: A unique identifier for the request

#### Method Not Found

**Symptoms**: Requests fail with a "Method not found" error.

**Solution**:
1. Check that the method name is correct.
2. Verify that the method is supported by the MCP Dust Server.
3. Ensure that you have the necessary permissions to call the method.

#### Invalid Parameters

**Symptoms**: Requests fail with an "Invalid params" error.

**Solution**:
1. Check that the parameters match the method's requirements.
2. Verify that all required parameters are included.
3. Ensure that parameter values are of the correct type.

### Dust API Integration Issues

#### Dust API Connection Issues

**Symptoms**: Requests fail with a "Dust API connection error" or timeout.

**Solution**:
1. Check that your Dust API key is correct.
2. Verify that the Dust API is accessible from your server.
3. Check if there are any Dust API outages or maintenance.
4. Try increasing the `DUST_API_TIMEOUT` value.

#### Workspace Not Found

**Symptoms**: Requests fail with a "Workspace not found" error.

**Solution**:
1. Verify that the workspace ID is correct.
2. Check that you have access to the workspace.
3. Ensure that the workspace exists in the Dust platform.

#### Agent Not Found

**Symptoms**: Requests fail with an "Agent not found" error.

**Solution**:
1. Verify that the agent ID is correct.
2. Check that you have access to the agent.
3. Ensure that the agent exists in the specified workspace.

### Performance Issues

#### High Latency

**Symptoms**: Requests take a long time to complete.

**Solution**:
1. Check the server's resource usage (CPU, memory).
2. Monitor the Dust API response times.
3. Consider scaling the server horizontally or vertically.
4. Optimize the server configuration:
   - Increase `NODE_ENV=production`
   - Adjust `MCP_SERVER_TIMEOUT`
   - Configure Node.js memory limits

#### Memory Leaks

**Symptoms**: Server memory usage increases over time.

**Solution**:
1. Monitor memory usage using the Prometheus metrics.
2. Check for memory leaks using tools like `node --inspect`.
3. Restart the server periodically if needed.
4. Update to the latest version, which may include memory leak fixes.

## Debugging Techniques

### Enabling Debug Logging

To enable debug logging, set the following environment variables:

```env
LOG_LEVEL=debug
LOG_FORMAT=pretty
LOG_REQUEST_BODY=true
LOG_REQUEST_HEADERS=true
LOG_RESPONSE_BODY=true
LOG_RESPONSE_HEADERS=true
```

This will log detailed information about requests, responses, and internal operations.

### Inspecting Network Traffic

To inspect network traffic between the MCP Dust Server and clients:

1. Use a tool like Wireshark or tcpdump to capture network traffic.
2. Use a proxy like Charles or Fiddler to inspect HTTP requests and responses.
3. Enable request and response logging as described above.

To inspect network traffic between the MCP Dust Server and the Dust API:

1. Enable debug logging as described above.
2. Set `LOG_REQUEST_BODY=true` and `LOG_RESPONSE_BODY=true` to log request and response bodies.

### Monitoring Resource Usage

To monitor resource usage:

1. Use the Prometheus metrics exposed at the `/metrics` endpoint.
2. Use the Grafana dashboards included in the `deployment/grafana/dashboards` directory.
3. Use system monitoring tools like `top`, `htop`, or `ps`.

## Error Codes

### HTTP Error Codes

| Code | Description | Possible Causes |
|------|-------------|----------------|
| 400 | Bad Request | Invalid request format or parameters |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server-side error |
| 502 | Bad Gateway | Error communicating with the Dust API |
| 503 | Service Unavailable | Server is overloaded or down for maintenance |
| 504 | Gateway Timeout | Timeout communicating with the Dust API |

### MCP Error Codes

| Code | Description | Possible Causes |
|------|-------------|----------------|
| -32600 | Invalid Request | Invalid JSON-RPC request |
| -32601 | Method not found | Invalid method name |
| -32602 | Invalid params | Invalid method parameters |
| -32603 | Internal error | Internal JSON-RPC error |
| -32000 | Server error | Generic server error |
| SESSION_REQUIRED | Session required | Missing session ID |
| SESSION_NOT_FOUND | Session not found | Invalid or expired session ID |
| RESOURCE_NOT_FOUND | Resource not found | Invalid resource URI |
| TOOL_NOT_FOUND | Tool not found | Invalid tool name |
| PERMISSION_DENIED | Permission denied | Insufficient permissions |

### Dust API Error Codes

| Code | Description | Possible Causes |
|------|-------------|----------------|
| AUTHENTICATION_ERROR | Authentication error | Invalid API key |
| WORKSPACE_NOT_FOUND | Workspace not found | Invalid workspace ID |
| AGENT_NOT_FOUND | Agent not found | Invalid agent ID |
| KNOWLEDGE_BASE_NOT_FOUND | Knowledge base not found | Invalid knowledge base ID |
| CONNECTOR_NOT_FOUND | Connector not found | Invalid connector ID |
| RATE_LIMIT_EXCEEDED | Rate limit exceeded | Too many requests to the Dust API |
| INTERNAL_SERVER_ERROR | Internal server error | Error in the Dust API |

## Getting Help

If you're still experiencing issues after trying the solutions in this guide, you can:

1. Check the [GitHub repository](https://github.com/your-org/mcp-dust-server) for known issues.
2. Open a new issue on GitHub with detailed information about the problem.
3. Contact the development team for assistance.

When reporting an issue, please include:

- The version of the MCP Dust Server you're using
- The environment you're running in (Node.js version, OS, etc.)
- The steps to reproduce the issue
- Any error messages or logs
- Any relevant configuration (with sensitive information redacted)
