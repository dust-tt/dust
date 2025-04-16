# MCP Dust Server Configuration Guide

This guide provides detailed information about configuring the MCP Dust Server for different environments and use cases.

## Table of Contents

- [Configuration Methods](#configuration-methods)
- [Environment Variables](#environment-variables)
- [Configuration Categories](#configuration-categories)
  - [Dust API Configuration](#dust-api-configuration)
  - [User Context](#user-context)
  - [MCP Server Configuration](#mcp-server-configuration)
  - [Logging Configuration](#logging-configuration)
  - [Security Configuration](#security-configuration)
  - [Metrics Configuration](#metrics-configuration)
- [Environment-Specific Configuration](#environment-specific-configuration)
  - [Development](#development)
  - [Testing](#testing)
  - [Production](#production)
- [Advanced Configuration](#advanced-configuration)
  - [Custom Middleware](#custom-middleware)
  - [Rate Limiting](#rate-limiting)
  - [CORS Configuration](#cors-configuration)

## Configuration Methods

The MCP Dust Server can be configured using the following methods, listed in order of precedence:

1. **Environment Variables**: Set directly in the environment
2. **`.env` File**: Environment variables loaded from a `.env` file
3. **Default Values**: Fallback values defined in the code

## Environment Variables

Here's a complete list of all available environment variables:

### Dust API Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DUST_API_KEY` | Your Dust API key | - | Yes |
| `DUST_WORKSPACE_ID` | Your primary Dust workspace ID | - | Yes |
| `DUST_AGENT_ID` | The ID of a Dust agent to use for default operations | - | Yes |
| `DUST_API_BASE_URL` | The base URL for the Dust API | `https://dust.tt/api/v1` | No |
| `DUST_API_TIMEOUT` | Timeout for Dust API requests in milliseconds | `30000` | No |

### User Context

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DUST_USERNAME` | Your Dust username | - | Yes |
| `DUST_EMAIL` | Your Dust email | - | Yes |
| `DUST_FULL_NAME` | Your full name | - | Yes |
| `DUST_TIMEZONE` | Your timezone | `UTC` | No |

### MCP Server Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `MCP_SERVER_NAME` | The name of the MCP server | `MCP Dust Server` | No |
| `MCP_SERVER_HOST` | The host to bind the server to | `localhost` | No |
| `MCP_SERVER_PORT` | The port to bind the server to | `5001` | No |
| `MCP_SERVER_TIMEOUT` | Timeout for MCP requests in seconds | `120` | No |
| `MCP_SERVER_MAX_PAYLOAD_SIZE` | Maximum payload size in bytes | `10485760` (10MB) | No |

### Logging Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `LOG_LEVEL` | The logging level | `info` | No |
| `LOG_FORMAT` | The logging format (`pretty` or `json`) | `pretty` | No |
| `LOG_REQUEST_BODY` | Whether to log request bodies | `false` | No |
| `LOG_REQUEST_HEADERS` | Whether to log request headers | `false` | No |
| `LOG_RESPONSE_BODY` | Whether to log response bodies | `false` | No |
| `LOG_RESPONSE_HEADERS` | Whether to log response headers | `false` | No |
| `LOG_FILE` | Path to log file (if empty, logs to console) | - | No |
| `LOG_MAX_SIZE` | Maximum size of log file before rotation | `10m` | No |
| `LOG_MAX_FILES` | Maximum number of log files to keep | `5` | No |

### Security Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `CORS_ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins | `*` | No |
| `SECURITY_SECRET_KEY` | Secret key for JWT signing | - | Yes |
| `SECURITY_TOKEN_EXPIRATION` | JWT token expiration in seconds | `3600` | No |
| `SESSION_TTL` | Session time-to-live in milliseconds | `3600000` | No |
| `ENABLE_RATE_LIMIT` | Whether to enable rate limiting | `true` | No |
| `RATE_LIMIT_WINDOW` | Rate limit window in seconds | `60` | No |
| `RATE_LIMIT_MAX_REQUESTS` | Maximum requests per window | `100` | No |
| `ENABLE_CSRF` | Whether to enable CSRF protection | `true` | No |
| `ENABLE_HELMET` | Whether to enable Helmet security headers | `true` | No |

### Metrics Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `ENABLE_METRICS` | Whether to enable Prometheus metrics | `true` | No |
| `METRICS_PREFIX` | Prefix for metrics names | `mcp_dust_server` | No |
| `METRICS_PATH` | Path for the metrics endpoint | `/metrics` | No |

## Environment-Specific Configuration

### Development

For development environments, we recommend the following configuration:

```env
# MCP Server Configuration
MCP_SERVER_HOST=localhost
MCP_SERVER_PORT=5001

# Logging Configuration
LOG_LEVEL=debug
LOG_FORMAT=pretty
LOG_REQUEST_BODY=true
LOG_REQUEST_HEADERS=true
LOG_RESPONSE_BODY=true
LOG_RESPONSE_HEADERS=true

# Security Configuration
CORS_ALLOWED_ORIGINS=http://localhost:3000
ENABLE_RATE_LIMIT=false
```

### Testing

For testing environments, we recommend the following configuration:

```env
# MCP Server Configuration
MCP_SERVER_HOST=localhost
MCP_SERVER_PORT=5002

# Logging Configuration
LOG_LEVEL=info
LOG_FORMAT=pretty
LOG_REQUEST_BODY=false
LOG_REQUEST_HEADERS=false
LOG_RESPONSE_BODY=false
LOG_RESPONSE_HEADERS=false

# Security Configuration
CORS_ALLOWED_ORIGINS=http://localhost:3000
ENABLE_RATE_LIMIT=false
```

### Production

For production environments, we recommend the following configuration:

```env
# MCP Server Configuration
MCP_SERVER_HOST=0.0.0.0
MCP_SERVER_PORT=5001

# Logging Configuration
LOG_LEVEL=info
LOG_FORMAT=json
LOG_REQUEST_BODY=false
LOG_REQUEST_HEADERS=false
LOG_RESPONSE_BODY=false
LOG_RESPONSE_HEADERS=false
LOG_FILE=/var/log/mcp-dust-server/server.log
LOG_MAX_SIZE=100m
LOG_MAX_FILES=10

# Security Configuration
CORS_ALLOWED_ORIGINS=https://your-production-domain.com
ENABLE_RATE_LIMIT=true
RATE_LIMIT_WINDOW=60
RATE_LIMIT_MAX_REQUESTS=100
ENABLE_CSRF=true
ENABLE_HELMET=true

# Metrics Configuration
ENABLE_METRICS=true
METRICS_PREFIX=mcp_dust_server
```

## Advanced Configuration

### Custom Middleware

You can add custom middleware by modifying the `src/middleware/index.ts` file. The middleware is applied in the order they are defined.

### Rate Limiting

Rate limiting is implemented using the `express-rate-limit` package. You can configure it using the following environment variables:

- `ENABLE_RATE_LIMIT`: Whether to enable rate limiting
- `RATE_LIMIT_WINDOW`: Rate limit window in seconds
- `RATE_LIMIT_MAX_REQUESTS`: Maximum requests per window

For more advanced rate limiting, you can modify the `src/middleware/rate-limit-middleware.ts` file.

### CORS Configuration

Cross-Origin Resource Sharing (CORS) is configured using the `cors` package. You can configure it using the following environment variable:

- `CORS_ALLOWED_ORIGINS`: Comma-separated list of allowed CORS origins

For more advanced CORS configuration, you can modify the `src/middleware/cors-middleware.ts` file.
