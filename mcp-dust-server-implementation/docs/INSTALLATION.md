# MCP Dust Server Installation and Configuration Guide

This guide provides detailed instructions for installing, configuring, and running the MCP Dust Server.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Server](#running-the-server)
- [Docker Deployment](#docker-deployment)
- [Production Deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before installing the MCP Dust Server, ensure you have the following prerequisites:

- **Node.js**: Version 18.x or higher
- **npm**: Version 9.x or higher
- **Dust.tt Account**: An account with API access
- **Dust Workspace**: A workspace to connect to
- **Dust Agent**: An agent to use for execution

## Installation

### Clone the Repository

```bash
git clone https://github.com/yourusername/mcp-dust-server.git
cd mcp-dust-server
```

### Install Dependencies

```bash
npm install
```

## Configuration

The MCP Dust Server uses environment variables for configuration. You can set these variables in a `.env` file in the root directory of the project.

### Create Environment File

Create a `.env` file based on the `.env.example` file:

```bash
cp .env.example .env
```

### Configure Environment Variables

Edit the `.env` file and set the following variables:

#### Server Configuration

```
# MCP Server Configuration
MCP_SERVER_NAME=Dust MCP Server
MCP_SERVER_HOST=0.0.0.0
MCP_SERVER_PORT=5001
MCP_REQUEST_TIMEOUT=30
```

#### Dust API Configuration

```
# Dust API Configuration
DUST_API_KEY=your-dust-api-key
DUST_WORKSPACE_ID=your-workspace-id
DUST_AGENT_ID=your-agent-id
DUST_USERNAME=your-username
DUST_EMAIL=your-email
DUST_FULL_NAME=Your Name
DUST_TIMEZONE=UTC
```

#### CORS Configuration

```
# CORS Configuration
CORS_ALLOWED_ORIGINS=http://localhost:3000,https://your-app-domain.com
```

#### Security Configuration

```
# Security Configuration
SECURITY_SECRET_KEY=your-secret-key
SECURITY_TOKEN_EXPIRATION=3600
SESSION_TTL=3600000
```

#### Logging Configuration

```
# Logging Configuration
LOG_LEVEL=info
LOG_FORMAT=json
LOG_REQUEST_BODY=false
LOG_REQUEST_HEADERS=false
LOG_RESPONSE_BODY=false
LOG_RESPONSE_HEADERS=false
```

### Configuration Options

#### MCP Server Configuration

- `MCP_SERVER_NAME`: Name of the MCP server
- `MCP_SERVER_HOST`: Host to bind the server to (default: 0.0.0.0)
- `MCP_SERVER_PORT`: Port to listen on (default: 5001)
- `MCP_REQUEST_TIMEOUT`: Request timeout in seconds (default: 30)

#### Dust API Configuration

- `DUST_API_KEY`: Your Dust API key
- `DUST_WORKSPACE_ID`: ID of your Dust workspace
- `DUST_AGENT_ID`: ID of your Dust agent
- `DUST_USERNAME`: Your Dust username
- `DUST_EMAIL`: Your Dust email
- `DUST_FULL_NAME`: Your full name
- `DUST_TIMEZONE`: Your timezone

#### CORS Configuration

- `CORS_ALLOWED_ORIGINS`: Comma-separated list of allowed origins for CORS

#### Security Configuration

- `SECURITY_SECRET_KEY`: Secret key for JWT token generation
- `SECURITY_TOKEN_EXPIRATION`: Token expiration time in seconds
- `SESSION_TTL`: Session time-to-live in milliseconds

#### Logging Configuration

- `LOG_LEVEL`: Log level (trace, debug, info, warn, error, fatal)
- `LOG_FORMAT`: Log format (json, pretty)
- `LOG_REQUEST_BODY`: Whether to log request bodies
- `LOG_REQUEST_HEADERS`: Whether to log request headers
- `LOG_RESPONSE_BODY`: Whether to log response bodies
- `LOG_RESPONSE_HEADERS`: Whether to log response headers

## Running the Server

### Build the TypeScript Code

```bash
npm run build
```

### Start the Server

```bash
npm start
```

### Development Mode

For development with auto-reload:

```bash
npm run dev
```

### Verify the Server is Running

Open a web browser and navigate to:

```
http://localhost:5001/api/v1/status
```

You should see a JSON response with the server status.

## Docker Deployment

The MCP Dust Server can be deployed using Docker for easier deployment and management.

### Build the Docker Image

```bash
docker build -t mcp-dust-server .
```

### Run the Docker Container

```bash
docker run -p 5001:5001 --env-file .env mcp-dust-server
```

### Docker Compose

You can also use Docker Compose for deployment:

```yaml
# docker-compose.yml
version: '3'
services:
  mcp-dust-server:
    build: .
    ports:
      - "5001:5001"
    env_file:
      - .env
    restart: unless-stopped
```

Run with Docker Compose:

```bash
docker-compose up -d
```

## Production Deployment

For production deployment, consider the following recommendations:

### Use a Process Manager

Use a process manager like PM2 to manage the Node.js process:

```bash
# Install PM2
npm install -g pm2

# Start the server with PM2
pm2 start dist/server.js --name mcp-dust-server

# Configure PM2 to start on system boot
pm2 startup
pm2 save
```

### Use a Reverse Proxy

Use a reverse proxy like Nginx or Apache to handle SSL termination and load balancing:

#### Nginx Configuration Example

```nginx
server {
    listen 80;
    server_name mcp-dust-server.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name mcp-dust-server.example.com;

    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;

    location / {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Environment-Specific Configuration

Create environment-specific configuration files:

- `.env.development`: Development environment configuration
- `.env.test`: Test environment configuration
- `.env.production`: Production environment configuration

Load the appropriate configuration file based on the `NODE_ENV` environment variable:

```bash
# Development
NODE_ENV=development npm start

# Production
NODE_ENV=production npm start
```

### Security Considerations

For production deployment, consider the following security measures:

- Use HTTPS for all communication
- Set secure HTTP headers
- Use a strong secret key for JWT token generation
- Implement rate limiting
- Use a firewall to restrict access to the server
- Regularly update dependencies

## Troubleshooting

### Common Issues

#### Server Won't Start

**Issue**: The server fails to start with an error message.

**Solution**:
1. Check if the port is already in use:
   ```bash
   lsof -i :5001
   ```
2. Check if the environment variables are set correctly
3. Check if the Dust API key is valid
4. Check the logs for more information

#### Authentication Errors

**Issue**: Authentication fails with a 401 Unauthorized error.

**Solution**:
1. Check if the Dust API key is valid
2. Check if the API key has the necessary permissions
3. Check if the API key is being sent correctly in the request

#### Permission Errors

**Issue**: Permission checks fail with a 403 Forbidden error.

**Solution**:
1. Check if the user has the necessary permissions
2. Check if the workspace and agent IDs are correct
3. Check if the API key has access to the specified workspace and agent

#### Connection Errors

**Issue**: The server fails to connect to the Dust API.

**Solution**:
1. Check if the Dust API is accessible
2. Check if the network connection is working
3. Check if there are any firewall or proxy issues

### Logging

The MCP Dust Server uses Pino for logging. Logs are written to the console by default.

To change the log level, set the `LOG_LEVEL` environment variable:

```
LOG_LEVEL=debug
```

Available log levels:
- `trace`: Most verbose level
- `debug`: Debugging information
- `info`: Informational messages
- `warn`: Warning messages
- `error`: Error messages
- `fatal`: Fatal error messages

### Getting Help

If you encounter issues that are not covered in this guide, please:

1. Check the [GitHub Issues](https://github.com/yourusername/mcp-dust-server/issues) for similar problems
2. Create a new issue with detailed information about the problem
3. Include logs, error messages, and steps to reproduce the issue
