# MCP Dust Server Development Guide

This guide provides information for developers who want to contribute to or extend the MCP Dust Server.

## Table of Contents

- [Development Environment Setup](#development-environment-setup)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Debugging](#debugging)
- [Adding New Features](#adding-new-features)
- [Documentation](#documentation)
- [Pull Requests](#pull-requests)

## Development Environment Setup

### Prerequisites

- **Node.js**: Version 18.x or higher
- **npm**: Version 9.x or higher
- **Git**: Latest version
- **IDE**: Visual Studio Code (recommended)

### Setup Steps

1. **Clone the Repository**

   ```bash
   git clone https://github.com/yourusername/mcp-dust-server.git
   cd mcp-dust-server
   ```

2. **Install Dependencies**

   ```bash
   npm install
   ```

3. **Set Up Environment Variables**

   Create a `.env` file based on the `.env.example` file:

   ```bash
   cp .env.example .env
   ```

   Update the `.env` file with your development settings.

4. **Install VS Code Extensions (Recommended)**

   - ESLint
   - Prettier
   - TypeScript
   - EditorConfig for VS Code

5. **Start Development Server**

   ```bash
   npm run dev
   ```

   This will start the server with hot reloading enabled.

## Project Structure

The MCP Dust Server follows a modular structure to separate concerns and make the codebase more maintainable:

```
mcp-dust-server/
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
├── docs/                 # Documentation
├── dist/                 # Compiled JavaScript files
├── .env.example          # Example environment variables
├── .eslintrc.js          # ESLint configuration
├── .prettierrc           # Prettier configuration
├── tsconfig.json         # TypeScript configuration
└── package.json          # Project metadata and dependencies
```

### Key Directories and Files

- **src/config/**: Configuration files and environment variable handling
- **src/controllers/**: HTTP request handlers
- **src/middleware/**: Express middleware for authentication, error handling, etc.
- **src/resources/**: MCP resource definitions and implementations
- **src/routes/**: API route definitions
- **src/services/**: Business logic services
- **src/tools/**: MCP tool definitions and implementations
- **src/types/**: TypeScript type definitions
- **src/utils/**: Utility functions and helpers
- **src/server.ts**: Main server entry point

## Coding Standards

The MCP Dust Server follows strict coding standards to ensure code quality and consistency:

### TypeScript

- Use TypeScript for all code
- Define interfaces for all data structures
- Use proper type annotations
- Avoid using `any` type when possible
- Use type guards and type assertions when necessary

### ESLint and Prettier

The project uses ESLint and Prettier for code linting and formatting:

- **ESLint**: Enforces code quality rules
- **Prettier**: Enforces code formatting rules

Run linting:

```bash
npm run lint
```

Fix linting issues:

```bash
npm run lint:fix
```

### Naming Conventions

- **Files**: Use kebab-case for file names (e.g., `resource-provider.ts`)
- **Classes**: Use PascalCase for class names (e.g., `ResourceProvider`)
- **Interfaces**: Use PascalCase for interface names (e.g., `ResourceProviderOptions`)
- **Variables and Functions**: Use camelCase for variables and functions (e.g., `getResource`)
- **Constants**: Use UPPER_SNAKE_CASE for constants (e.g., `MAX_RETRY_COUNT`)

### Code Organization

- Group related functionality in the same file or directory
- Keep files small and focused on a single responsibility
- Use meaningful names for files, classes, and functions
- Add JSDoc comments for all public APIs

### Error Handling

- Use the `APIError` class for API errors
- Include error codes and messages
- Log errors with context information
- Handle errors at the appropriate level

## Testing

The MCP Dust Server uses Jest for testing:

### Unit Tests

Unit tests focus on testing individual components in isolation:

```bash
npm run test:unit
```

### Integration Tests

Integration tests focus on testing the interaction between components:

```bash
npm run test:integration
```

### All Tests

Run all tests:

```bash
npm test
```

### Test Coverage

Generate test coverage report:

```bash
npm run test:coverage
```

### Writing Tests

- Create test files with the `.test.ts` extension
- Place test files in the `tests/unit/` or `tests/integration/` directory
- Use descriptive test names
- Mock external dependencies
- Test both success and error cases

Example unit test:

```typescript
import { ResourceProvider } from '../../src/resources/resource-provider';

describe('ResourceProvider', () => {
  let resourceProvider: ResourceProvider;
  
  beforeEach(() => {
    // Set up test dependencies
    resourceProvider = new ResourceProvider({
      // Mock dependencies
    });
  });
  
  it('should get a resource by URI', async () => {
    // Arrange
    const uri = 'dust://workspaces/123';
    const apiKey = 'test-api-key';
    
    // Act
    const resource = await resourceProvider.getResource(uri, apiKey);
    
    // Assert
    expect(resource).toBeDefined();
    expect(resource.id).toBe('123');
  });
  
  it('should throw an error for invalid URI', async () => {
    // Arrange
    const uri = 'invalid-uri';
    const apiKey = 'test-api-key';
    
    // Act & Assert
    await expect(resourceProvider.getResource(uri, apiKey))
      .rejects
      .toThrow('Invalid URI');
  });
});
```

## Debugging

### VS Code Debugging

The project includes a VS Code launch configuration for debugging:

1. Set breakpoints in your code
2. Press F5 or click the "Run and Debug" button
3. Select "Debug Server" from the dropdown menu

### Manual Debugging

You can also debug the server manually:

```bash
# Start the server in debug mode
npm run debug
```

Then connect to the debugger using Chrome DevTools or another debugger.

### Logging

The server uses Pino for logging. You can adjust the log level in the `.env` file:

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

## Adding New Features

When adding new features to the MCP Dust Server, follow these steps:

1. **Create a Feature Branch**

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Implement the Feature**

   - Add new files and modify existing files as needed
   - Follow the coding standards
   - Add tests for the new feature

3. **Update Documentation**

   - Update the API documentation if you added new endpoints
   - Update the architecture documentation if you made significant changes
   - Add comments to your code

4. **Test the Feature**

   - Run the tests to ensure everything works
   - Test the feature manually

5. **Create a Pull Request**

   - Push your changes to GitHub
   - Create a pull request with a detailed description of the changes

### Adding a New MCP Resource

To add a new MCP resource:

1. Create a new file in the `src/resources/` directory
2. Define the resource class
3. Implement the required methods
4. Register the resource with the MCP server

Example:

```typescript
// src/resources/custom-resource.ts
import { MCPResource } from '../types/server';

export class CustomResource implements MCPResource {
  uriTemplate = 'dust://custom/{id}';
  name = 'Custom Resource';
  description = 'A custom resource';
  mimeType = 'application/json';
  
  async load(args: { id: string }, context: any) {
    // Implement resource loading logic
    return { text: JSON.stringify({ id: args.id }) };
  }
}

// Register the resource in src/server.ts
mcpServer.addResourceTemplate(new CustomResource());
```

### Adding a New MCP Tool

To add a new MCP tool:

1. Create a new file in the `src/tools/` directory
2. Define the tool class
3. Implement the required methods
4. Register the tool with the MCP server

Example:

```typescript
// src/tools/custom-tool.ts
import { z } from 'zod';
import { MCPTool } from '../types/server';

export class CustomTool implements MCPTool {
  name = 'dust/custom/tool';
  description = 'A custom tool';
  parameters = z.object({
    param1: z.string(),
    param2: z.number().optional(),
  });
  
  async execute(args: { param1: string, param2?: number }, context: any) {
    // Implement tool execution logic
    return {
      content: [
        {
          type: 'text',
          text: `Executed with param1=${args.param1}, param2=${args.param2 || 'not provided'}`,
        },
      ],
    };
  }
}

// Register the tool in src/server.ts
mcpServer.addTool(new CustomTool());
```

## Documentation

The MCP Dust Server uses Markdown for documentation:

### API Documentation

API documentation is in the `docs/API.md` file. Update this file when you add or modify API endpoints.

### Architecture Documentation

Architecture documentation is in the `docs/ARCHITECTURE.md` file. Update this file when you make significant changes to the architecture.

### Installation and Configuration

Installation and configuration documentation is in the `docs/INSTALLATION.md` file. Update this file when you change the installation or configuration process.

### Development Guide

Development documentation is in the `docs/DEVELOPMENT.md` file (this file). Update this file when you change the development process.

### Code Comments

Use JSDoc comments for all public APIs:

```typescript
/**
 * Get a resource by URI
 * @param uri Resource URI
 * @param apiKey API key
 * @returns Resource content
 * @throws {APIError} If the resource is not found or the user doesn't have permission
 */
public async getResource(uri: string, apiKey: string): Promise<ResourceContent> {
  // Implementation
}
```

## Pull Requests

When creating a pull request, follow these guidelines:

1. **Create a Feature Branch**

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Small, Focused Commits**

   ```bash
   git commit -m "Add feature X"
   ```

3. **Push Your Changes**

   ```bash
   git push origin feature/your-feature-name
   ```

4. **Create a Pull Request**

   - Go to the GitHub repository
   - Click "New Pull Request"
   - Select your branch
   - Add a detailed description of the changes

5. **Pull Request Description**

   Include the following information in your pull request description:

   - What changes were made
   - Why the changes were made
   - How to test the changes
   - Any related issues or pull requests

6. **Code Review**

   - Address any feedback from code reviewers
   - Make requested changes
   - Push additional commits to the same branch

7. **Merge**

   Once the pull request is approved, it will be merged into the main branch.
