# Task 2: Configure Environment and Dependencies

## Description
Set up the environment variables and install all necessary dependencies for the MCP Dust Server.

## Status
TODO

## Priority
HIGH

## Dependencies
1. Set Up Project Repository

## Subtasks
1. Create a .env.example file with required environment variables
2. Set up configuration loading from environment variables
3. Install and configure Express.js for the HTTP server
4. Install and configure TypeScript and related tools
5. Set up logging infrastructure
6. Configure development tools (ESLint, Prettier, etc.)

## Implementation Details
For this task, we need to configure the environment and install all necessary dependencies for our MCP Dust Server implementation.

### 1. Create .env.example File
Create a .env.example file with the following environment variables:
```
# Dust API Configuration
DUST_API_KEY=your_dust_api_key_here
DUST_WORKSPACE_ID=your_workspace_id_here
DUST_AGENT_ID=your_agent_id_here

# User Context
DUST_USERNAME=your_username_here
DUST_EMAIL=your_email_here
DUST_FULL_NAME=your_full_name_here
DUST_TIMEZONE=your_timezone_here

# MCP Server Configuration
MCP_SERVER_NAME=MCP Dust Server
MCP_SERVER_HOST=localhost
MCP_SERVER_PORT=5001
MCP_SERVER_TIMEOUT=120

# Logging Configuration
LOG_LEVEL=info
LOG_FORMAT=json

# Security Configuration
CORS_ALLOWED_ORIGINS=http://localhost:3000,https://your-app-domain.com
```

### 2. Set Up Configuration Loading
Create a configuration module in `src/config/index.ts` that:
- Loads environment variables using dotenv
- Validates required environment variables
- Provides typed access to configuration values
- Has sensible defaults for optional values

### 3. Install and Configure Express.js
Install Express.js and related packages:
```bash
npm install express cors
npm install --save-dev @types/express @types/cors
```

### 4. Install and Configure TypeScript
Install TypeScript and related tools:
```bash
npm install --save-dev typescript ts-node @types/node
```

Create a tsconfig.json file with appropriate settings for a Node.js project.

### 5. Set Up Logging Infrastructure
Install Pino for logging:
```bash
npm install pino pino-pretty
```

Create a logging module in `src/utils/logger.ts` that:
- Configures Pino based on environment variables
- Provides a consistent logging interface
- Supports different log formats (JSON, pretty)
- Includes contextual information in logs

### 6. Configure Development Tools
Install and configure ESLint and Prettier:
```bash
npm install --save-dev eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser prettier eslint-config-prettier eslint-plugin-prettier
```

Create configuration files:
- .eslintrc.js
- .prettierrc
- .editorconfig

## Test Strategy
- Verify that all environment variables are properly loaded
- Ensure that configuration validation works correctly
- Confirm that logging is properly configured
- Validate that ESLint and Prettier are working as expected
- Test the configuration with different environment settings
