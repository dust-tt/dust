# MCP Dust Server Implementation

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18.x-green)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-lightgrey)](https://expressjs.com/)
[![MCP](https://img.shields.io/badge/MCP-1.0-orange)](https://modelcontextprotocol.org/)

This project implements a Model Context Protocol (MCP) server for Dust.tt using the TypeScript implementation from [ma3u/mcp-dust-server](https://github.com/ma3u/mcp-dust-server) as a base. The server enables Task Master and other MCP clients to leverage Dust's AI capabilities through a standardized protocol.

## Project Overview

The MCP Dust Server provides a bridge between Dust's powerful AI platform and the Model Context Protocol, enabling seamless integration with tools like Task Master. This implementation focuses on:

- Extending the existing TypeScript MCP server implementation
- Implementing authentication and permission controls based on Dust's existing auth system
- Exposing Dust's workspaces, agents, and knowledge bases through MCP
- Making Dust connectors accessible via MCP
- Integrating Task Master with the Dust MCP server

![MCP Dust Server Architecture](docs/images/mcp-dust-server-architecture.png)

## Key Features

- **MCP Protocol Implementation**: Full implementation of the Model Context Protocol specification
- **Dust API Integration**: Seamless integration with the Dust AI platform
- **Authentication & Authorization**: Secure access control with API key validation and permission checking
- **Resource Hierarchy**: Organized access to Dust workspaces, agents, knowledge bases, and connectors
- **Tool Execution**: Execute Dust agents, search knowledge bases, and sync connectors
- **Event System**: Real-time notifications for Dust events
- **REST API**: Alternative HTTP endpoints for direct access
- **Monitoring & Metrics**: Prometheus metrics for observability
- **Scalable Architecture**: Designed for horizontal scaling and high availability

## Implementation Plan

The implementation is organized into 25 tasks, each with specific subtasks. The tasks are organized in a logical sequence, with dependencies between them to ensure a smooth implementation process.

### Key Tasks

1. **Set Up Project Repository** - Initialize the project repository and set up the basic structure
2. **Configure Environment and Dependencies** - Set up environment variables and install dependencies
3. **Implement Core MCP Server Structure** - Create the basic server structure
4. **Implement DustService Class** - Create the service that interacts with Dust's API
5. **Implement Authentication System** - Set up authentication with Dust
6. **Implement API Reflection Layer** - Map Dust's API to MCP resources and tools
7. **Implement Permission Proxy** - Create a unified interface for permission checking
8. **Implement Event Bridge** - Connect Dust's events with MCP notifications
9. **Implement Resource Hierarchy** - Create a clear hierarchy of MCP resources
10. **Implement Workspace Integration** - Expose Dust workspaces as MCP resources
11. **Implement Agent Integration** - Make Dust agents available as MCP tools
12. **Implement Knowledge Base Integration** - Expose knowledge bases as MCP resources
13. **Implement Connector Integration** - Make Dust connectors accessible through MCP
14. **Implement Task Master Integration** - Enable Task Master to work with the MCP Dust Server
15. **Implement Error Handling and Logging** - Create comprehensive error handling
16. **Implement Performance Optimization** - Optimize server performance
17. **Create Comprehensive Documentation** - Document all aspects of the server
18. **Implement Testing Infrastructure** - Set up testing frameworks
19. **Write Unit Tests** - Create tests for all components
20. **Write Integration Tests** - Test component interactions
21. **Perform Security Audit** - Ensure the server is secure
22. **Create Deployment Infrastructure** - Set up deployment configurations
23. **Perform End-to-End Testing** - Test the complete system
24. **Prepare for Production Deployment** - Finalize production configuration
25. **Deploy to Production** - Deploy the server to production

## Getting Started

### Prerequisites

- Node.js 18.x or higher
- npm 8.x or higher
- Dust AI account with API key

### Installation

#### From Source

```bash
# Clone the repository
git clone https://github.com/your-org/mcp-dust-server.git
cd mcp-dust-server

# Install dependencies
npm install

# Build the project
npm run build
```

#### Using Docker

```bash
# Pull the Docker image
docker pull ghcr.io/your-org/mcp-dust-server:latest

# Or build the Docker image locally
docker build -t mcp-dust-server .
```

### Configuration

Create a `.env` file in the project root with the following variables:

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

See the [Configuration Guide](docs/guides/CONFIGURATION.md) for detailed information about each configuration option.

### Running the Server

#### Development Mode

```bash
# Start the server in development mode with hot reloading
npm run dev
```

#### Production Mode

```bash
# Start the server in production mode
npm start
```

#### Using Docker Compose

```bash
# Start the server using Docker Compose
docker-compose up -d
```

### Verifying the Installation

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

## Documentation

### Guides

- [Getting Started Guide](docs/guides/GETTING_STARTED.md)
- [Configuration Guide](docs/guides/CONFIGURATION.md)
- [Authentication Guide](docs/guides/AUTHENTICATION.md)
- [Deployment Guide](docs/guides/DEPLOYMENT.md)
- [Monitoring Guide](docs/guides/MONITORING.md)
- [Troubleshooting Guide](docs/guides/TROUBLESHOOTING.md)
- [End-to-End Testing Guide](docs/guides/END_TO_END_TESTING.md)

### Reference

- [API Reference](docs/API.md)
- [Architecture Overview](docs/ARCHITECTURE.md)
- [MCP Protocol Reference](docs/reference/MCP_PROTOCOL.md)
- [Resource Reference](docs/reference/RESOURCES.md)
- [Tool Reference](docs/reference/TOOLS.md)
- [REST API Reference](docs/reference/REST_API.md)

### Examples

- [Basic Usage](docs/examples/BASIC_USAGE.md)
- [Agent Execution](docs/examples/AGENT_EXECUTION.md)
- [Knowledge Base Search](docs/examples/KNOWLEDGE_BASE_SEARCH.md)
- [Connector Sync](docs/examples/CONNECTOR_SYNC.md)
- [Task Master Integration](docs/examples/TASK_MASTER_INTEGRATION.md)

## Development

### Project Structure

```
├── src/                  # Source code
│   ├── config/           # Configuration
│   ├── controllers/      # HTTP controllers
│   ├── middleware/       # Express middleware
│   ├── models/           # Data models
│   ├── routes/           # API routes
│   ├── services/         # Business logic
│   ├── types/            # TypeScript types
│   ├── utils/            # Utility functions
│   ├── server.ts         # Server entry point
│   └── index.ts          # Application entry point
├── tests/                # Tests
│   ├── unit/             # Unit tests
│   ├── integration/      # Integration tests
│   ├── e2e/              # End-to-end tests
│   ├── fixtures/         # Test fixtures
│   ├── mocks/            # Mock services
│   └── utils/            # Test utilities
├── docs/                 # Documentation
├── deployment/           # Deployment configuration
└── scripts/              # Utility scripts
```

### Available Scripts

- `npm run build`: Build the project
- `npm run dev`: Start the server in development mode
- `npm start`: Start the server in production mode
- `npm test`: Run all tests
- `npm run test:unit`: Run unit tests
- `npm run test:integration`: Run integration tests
- `npm run test:e2e`: Run end-to-end tests
- `npm run test:all`: Run all tests (unit, integration, and end-to-end)
- `npm run test:coverage`: Generate test coverage report
- `npm run lint`: Run linting
- `npm run format`: Format code
- `npm run docs`: Generate documentation

## Contributing

Contributions are welcome! Please see our [Contributing Guide](CONTRIBUTING.md) for more information.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgements

- [Dust AI](https://dust.tt/) for their powerful AI platform
- [Model Context Protocol](https://github.com/ma3u/fastmcp) for the MCP specification
- [Task Master](https://github.com/eyaltoledano/claude-task-master) for inspiring this integration
- npm 9.x or higher
- A Dust.tt account with API access
- A Dust workspace and agent

### Installation

1. Clone this repository:

   ```bash
   git clone https://github.com/yourusername/mcp-dust-server.git
   cd mcp-dust-server
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file based on the `.env.example` file:

   ```bash
   cp .env.example .env
   ```

4. Update the `.env` file with your Dust API key, workspace ID, and other configuration options.

### Running the Server

1. Build the TypeScript code:

   ```bash
   npm run build
   ```

2. Start the server:

   ```bash
   npm start
   ```

   For development with auto-reload:

   ```bash
   npm run dev
   ```

3. The server will be available at `http://localhost:5001` (or the port specified in your `.env` file).

### Using with Task Master

1. Install Task Master:

   ```bash
   npm install -g claude-task-master
   ```

2. Configure Task Master to use your MCP Dust Server:

   ```bash
   task-master-ai config set mcp.server.url http://localhost:5001
   ```

3. Start using Task Master with your MCP Dust Server:
   ```bash
   task-master-ai list
   ```

## Task Management

This project uses Task Master for task management. The implementation is organized into 25 tasks, each with specific subtasks. The tasks are managed using the custom task manager script in the `scripts` directory.

### Using the Task Manager

```bash
# List all tasks
node scripts/task-manager.js list

# Show the next task to work on
node scripts/task-manager.js next

# Show details of a specific task
node scripts/task-manager.js show <id>

# Mark a task as in progress
node scripts/task-manager.js update <id> IN_PROGRESS

# Mark a task as done
node scripts/task-manager.js update <id> DONE
```

### Task Structure

Each task in the implementation plan has the following structure:

- **ID**: Unique identifier for the task
- **Title**: Brief description of the task
- **Description**: Detailed description of what the task involves
- **Status**: Current status of the task (TODO, IN_PROGRESS, DONE)
- **Priority**: Importance of the task (LOW, MEDIUM, HIGH)
- **Subtasks**: List of specific items to complete for the task
- **Dependencies**: Tasks that must be completed before this task can be started

### Task Workflow

1. Start with the next task in the sequence
2. Mark the task as IN_PROGRESS
3. Complete all subtasks for the task
4. Mark the task as DONE
5. Move on to the next task

## Architecture

### System Components

The MCP Dust Server consists of the following key components:

1. **Core MCP Server**: Implements the Model Context Protocol specification
2. **Dust Service**: Provides a client for interacting with the Dust API
3. **Authentication System**: Handles API key validation and session management
4. **Permission Proxy**: Manages access control for resources and tools
5. **Resource Hierarchy**: Organizes Dust resources in a hierarchical structure
6. **Event Bridge**: Connects Dust events with MCP notifications
7. **API Reflection Layer**: Maps Dust's API to MCP resources and tools

### Component Diagram

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

### Directory Structure

```
├── src/                  # Source code
│   ├── config/           # Configuration files
│   ├── controllers/      # API controllers
│   ├── middleware/       # Express middleware
│   ├── resources/        # MCP resource definitions
│   ├── routes/           # API routes
│   ├── services/         # Business logic services
│   ├── tools/            # MCP tool definitions
│   ├── types/            # TypeScript type definitions
│   ├── utils/            # Utility functions
│   └── server.ts         # Main server entry point
├── scripts/              # Utility scripts
├── tests/                # Test files
│   ├── unit/             # Unit tests
│   └── integration/      # Integration tests
└── docs/                 # Documentation
```

## API Documentation

### MCP Resources

The MCP Dust Server exposes the following resources:

- `dust://` - Root resource
- `dust://workspaces` - List of workspaces
- `dust://workspaces/{workspaceId}` - Workspace details
- `dust://workspaces/{workspaceId}/agents` - List of agents in a workspace
- `dust://workspaces/{workspaceId}/agents/{agentId}` - Agent details
- `dust://workspaces/{workspaceId}/knowledge-bases` - List of knowledge bases in a workspace
- `dust://workspaces/{workspaceId}/knowledge-bases/{knowledgeBaseId}` - Knowledge base details
- `dust://workspaces/{workspaceId}/connectors` - List of connectors in a workspace
- `dust://workspaces/{workspaceId}/connectors/{connectorId}` - Connector details

### MCP Tools

The MCP Dust Server provides the following tools:

- `dust/workspace/*` - Tools for managing workspaces
- `dust/agent/*` - Tools for executing agents and managing agent configurations
- `dust/knowledge/*` - Tools for searching knowledge bases and managing documents
- `dust/connector/*` - Tools for syncing connectors and managing connector configurations

### REST API Endpoints

In addition to the MCP protocol, the server also provides REST API endpoints:

- `GET /api/v1/status` - Get server status
- `GET /api/v1/workspaces` - List workspaces
- `GET /api/v1/workspaces/{workspaceId}` - Get workspace details
- `GET /api/v1/workspaces/{workspaceId}/agents` - List agents in a workspace
- `GET /api/v1/workspaces/{workspaceId}/agents/{agentId}` - Get agent details
- `POST /api/v1/workspaces/{workspaceId}/agents/{agentId}/execute` - Execute an agent

## Resources

- [MCP Dust Server Repository](https://github.com/ma3u/mcp-dust-server) - Base implementation
- [Model Context Protocol Specification](https://modelcontextprotocol.org/) - MCP protocol documentation
- [Task Master GitHub Repository](https://github.com/eyaltoledano/claude-task-master) - MCP client
- [Dust API Documentation](https://docs.dust.tt/) - Dust API reference
- [Dust Codebase Structure](https://github.com/dust-tt/dust) - Dust source code
- [Express.js Documentation](https://expressjs.com/) - Web framework used
- [TypeScript Documentation](https://www.typescriptlang.org/docs/) - Programming language

## Contributing

Contributions are welcome! Please follow these steps to contribute:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please make sure your code follows the project's coding standards and includes appropriate tests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
