# Getting Started with MCP Dust Server

This guide will help you get started with the MCP Dust Server, from installation to your first MCP client connection.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Server](#running-the-server)
- [Verifying the Installation](#verifying-the-installation)
- [Connecting an MCP Client](#connecting-an-mcp-client)
- [Next Steps](#next-steps)

## Prerequisites

Before you begin, ensure you have the following:

- **Node.js**: Version 18.x or higher
- **npm**: Version 8.x or higher
- **Dust AI Account**: You'll need an account with API access
- **Dust Workspace**: A workspace where you have access to agents and knowledge bases
- **Dust API Key**: An API key with appropriate permissions

## Installation

You can install the MCP Dust Server either from source or using Docker.

### From Source

1. Clone the repository:

```bash
git clone https://github.com/your-org/mcp-dust-server.git
cd mcp-dust-server
```

2. Install dependencies:

```bash
npm install
```

3. Build the project:

```bash
npm run build
```

### Using Docker

Pull the Docker image:

```bash
docker pull ghcr.io/your-org/mcp-dust-server:latest
```

Or build the Docker image locally:

```bash
docker build -t mcp-dust-server .
```

## Configuration

The MCP Dust Server uses environment variables for configuration. Create a `.env` file in the project root with the following variables:

```env
# Dust API Configuration
DUST_API_KEY=your_dust_api_key
DUST_WORKSPACE_ID=your_workspace_id
DUST_AGENT_ID=your_agent_id

# User Context
DUST_USERNAME=your_username
DUST_EMAIL=your_email
DUST_FULL_NAME=Your Full Name
DUST_TIMEZONE=America/New_York

# MCP Server Configuration
MCP_SERVER_NAME=MCP Dust Server
MCP_SERVER_HOST=localhost
MCP_SERVER_PORT=5001
MCP_SERVER_TIMEOUT=120

# Logging Configuration
LOG_LEVEL=info
LOG_FORMAT=pretty
LOG_REQUEST_BODY=false
LOG_REQUEST_HEADERS=false
LOG_RESPONSE_BODY=false
LOG_RESPONSE_HEADERS=false

# Security Configuration
CORS_ALLOWED_ORIGINS=http://localhost:3000
SECURITY_SECRET_KEY=your_secret_key
SECURITY_TOKEN_EXPIRATION=3600
SESSION_TTL=3600000

# Metrics Configuration
ENABLE_METRICS=true
METRICS_PREFIX=mcp_dust_server
```

### Required Configuration

At a minimum, you must set the following variables:

- `DUST_API_KEY`: Your Dust API key
- `DUST_WORKSPACE_ID`: Your primary Dust workspace ID
- `DUST_AGENT_ID`: The ID of a Dust agent to use for default operations
- `SECURITY_SECRET_KEY`: A secure random string for JWT signing

For more detailed information about each configuration option, see the [Configuration Guide](CONFIGURATION.md).

## Running the Server

### Development Mode

To start the server in development mode with hot reloading:

```bash
npm run dev
```

### Production Mode

To start the server in production mode:

```bash
npm start
```

### Using Docker Compose

Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  mcp-dust-server:
    image: ghcr.io/your-org/mcp-dust-server:latest
    # or use the local image
    # image: mcp-dust-server
    ports:
      - "5001:5001"
    env_file:
      - .env
    restart: unless-stopped
```

Then start the server:

```bash
docker-compose up -d
```

## Verifying the Installation

Once the server is running, you can verify the installation by accessing the health endpoint:

```bash
curl http://localhost:5001/health
```

You should receive a response like:

```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2023-06-01T12:00:00Z"
}
```

You can also check the API documentation endpoint:

```bash
curl http://localhost:5001/api/docs
```

## Connecting an MCP Client

### Task Master

To connect Task Master to your MCP Dust Server:

1. Install Task Master:

```bash
npm install -g claude-task-master
```

2. Configure Task Master to use your MCP Dust Server:

```bash
task-master config set mcp.server http://localhost:5001
```

3. Test the connection:

```bash
task-master test-connection
```

### Other MCP Clients

For other MCP clients, you'll need to configure them to connect to your MCP Dust Server at `http://localhost:5001`.

The MCP Dust Server implements the following MCP endpoints:

- `/stream`: The main MCP endpoint for JSON-RPC requests
- `/api/v1`: REST API endpoints for direct access

## Next Steps

Now that you have the MCP Dust Server up and running, you can:

- Learn about the [MCP Protocol](../reference/MCP_PROTOCOL.md)
- Explore the [Resource Hierarchy](../reference/RESOURCES.md)
- Try out the [Tool Execution](../reference/TOOLS.md)
- Check out the [Examples](../examples/BASIC_USAGE.md)
- Set up [Monitoring](MONITORING.md)

For more advanced topics, see:

- [Authentication Guide](AUTHENTICATION.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Troubleshooting Guide](TROUBLESHOOTING.md)
