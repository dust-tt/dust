# End-to-End Testing Guide

This guide explains how to run and write end-to-end tests for the MCP Dust Server.

## Table of Contents

- [Overview](#overview)
- [Test Environment Setup](#test-environment-setup)
- [Running End-to-End Tests](#running-end-to-end-tests)
- [Test Structure](#test-structure)
- [Writing New Tests](#writing-new-tests)
- [Continuous Integration](#continuous-integration)
- [Troubleshooting](#troubleshooting)

## Overview

End-to-end (E2E) tests verify that the entire system works correctly from the client's perspective. They test the application as a whole, including all its components and integrations.

The MCP Dust Server E2E tests cover:

1. Authentication flow
2. MCP protocol implementation
3. REST API endpoints
4. Task Master integration
5. Performance characteristics
6. Security features

## Test Environment Setup

### Prerequisites

- Node.js 18.x or higher
- npm 8.x or higher
- A test Dust API key
- Access to a test Dust workspace and agent

### Configuration

Create a `.env.e2e` file in the project root with the following variables:

```env
# End-to-End Test Environment Configuration

# Dust API Configuration
DUST_API_KEY=your_test_api_key
DUST_WORKSPACE_ID=your_test_workspace_id
DUST_AGENT_ID=your_test_agent_id

# User Context
DUST_USERNAME=test_user
DUST_EMAIL=test@example.com
DUST_FULL_NAME=Test User
DUST_TIMEZONE=UTC

# MCP Server Configuration
MCP_SERVER_NAME=MCP Dust Server Test
MCP_SERVER_HOST=localhost
MCP_SERVER_PORT=5002
MCP_SERVER_TIMEOUT=30

# Logging Configuration
LOG_LEVEL=error
LOG_FORMAT=pretty
LOG_REQUEST_BODY=false
LOG_REQUEST_HEADERS=false
LOG_RESPONSE_BODY=false
LOG_RESPONSE_HEADERS=false

# Security Configuration
CORS_ALLOWED_ORIGINS=http://localhost:3000
SECURITY_SECRET_KEY=your_test_secret_key
SECURITY_TOKEN_EXPIRATION=3600
SESSION_TTL=3600000

# Metrics Configuration
ENABLE_METRICS=false
METRICS_PREFIX=mcp_dust_server_test

# Test Configuration
TEST_MODE=true
TEST_TIMEOUT=30000
```

## Running End-to-End Tests

### Building the Project

Before running the tests, build the project:

```bash
npm run build
```

### Running All E2E Tests

To run all end-to-end tests:

```bash
npm run test:e2e
```

This will:
1. Start the MCP Dust Server on port 5002
2. Run all the end-to-end tests
3. Shut down the server when tests are complete

### Running Specific Tests

To run a specific test file:

```bash
npx jest tests/e2e/auth-flow.test.ts
```

To run tests matching a specific pattern:

```bash
npx jest -t "Authentication Flow"
```

### Running All Tests

To run unit, integration, and end-to-end tests:

```bash
npm run test:all
```

## Test Structure

The end-to-end tests are organized into the following files:

- `setup.ts`: Common setup and utilities for all tests
- `auth-flow.test.ts`: Tests for the authentication flow
- `mcp-protocol.test.ts`: Tests for the MCP protocol implementation
- `rest-api.test.ts`: Tests for the REST API endpoints
- `taskmaster-integration.test.ts`: Tests for Task Master integration
- `performance.test.ts`: Tests for performance characteristics
- `security.test.ts`: Tests for security features

### Setup File

The `setup.ts` file provides common utilities for all tests:

- Starting and stopping the server
- Creating an authentication token
- Creating an MCP session
- Helper functions for making requests

### Test Files

Each test file focuses on a specific aspect of the system and contains multiple test cases. Tests are organized using Jest's `describe` and `test` functions.

## Writing New Tests

### Basic Structure

```typescript
import { request, getAuthHeader, mcpRequest } from './setup.js';

describe('My Feature', () => {
  test('should do something', async () => {
    // Arrange
    const input = 'test input';
    
    // Act
    const response = await request
      .post('/api/v1/some-endpoint')
      .set(getAuthHeader())
      .send({ input })
      .expect(200);
    
    // Assert
    expect(response.body).toHaveProperty('expectedProperty');
    expect(response.body.expectedProperty).toBe('expected value');
  });
});
```

### Making HTTP Requests

Use the `request` object from `setup.ts` to make HTTP requests:

```typescript
const response = await request
  .get('/api/v1/workspaces')
  .set(getAuthHeader())
  .expect(200);
```

### Making MCP Protocol Requests

Use the `mcpRequest` function from `setup.ts` to make MCP protocol requests:

```typescript
const response = await mcpRequest('mcp.resource.list', {
  uri: 'dust://workspaces',
}, 1);
```

### Best Practices

1. **Independence**: Each test should be independent of others
2. **Clarity**: Use descriptive test names
3. **Organization**: Group related tests using `describe` blocks
4. **Setup/Teardown**: Use `beforeAll` and `afterAll` for setup and teardown
5. **Error Handling**: Handle potential test failures gracefully
6. **Timeouts**: Add appropriate timeouts for long-running tests
7. **Assertions**: Make specific assertions about the response

## Continuous Integration

The MCP Dust Server uses GitHub Actions for continuous integration. The E2E tests are run automatically on push to the `main` and `develop` branches, and on pull requests to these branches.

### GitHub Actions Workflow

The workflow is defined in `.github/workflows/e2e-tests.yml` and performs the following steps:

1. Checkout the code
2. Set up Node.js
3. Install dependencies
4. Build the project
5. Create a `.env.e2e` file with secrets from GitHub
6. Run the end-to-end tests
7. Upload test results as artifacts

### Required Secrets

The following secrets must be set in the GitHub repository:

- `TEST_DUST_API_KEY`: A test Dust API key
- `TEST_DUST_WORKSPACE_ID`: A test Dust workspace ID
- `TEST_DUST_AGENT_ID`: A test Dust agent ID
- `TEST_SECRET_KEY`: A secret key for JWT signing

## Troubleshooting

### Common Issues

#### Tests Fail to Connect to Server

If tests fail to connect to the server:

1. Check that the server is running on the correct port (5002 by default)
2. Check that the `.env.e2e` file has the correct configuration
3. Increase the timeout in the `run-e2e-tests.js` script

#### Authentication Failures

If tests fail due to authentication issues:

1. Check that the Dust API key is valid
2. Check that the workspace and agent IDs are correct
3. Check that the secret key is set correctly

#### Timeouts

If tests time out:

1. Increase the test timeout in Jest configuration
2. Check for performance issues in the server
3. Simplify the test to isolate the issue

### Debugging

To enable more verbose logging during tests:

1. Set `LOG_LEVEL=debug` in `.env.e2e`
2. Set `LOG_REQUEST_BODY=true` and `LOG_RESPONSE_BODY=true`
3. Run the tests with the `--verbose` flag:

```bash
npx jest --verbose tests/e2e/auth-flow.test.ts
```

### Getting Help

If you're still experiencing issues:

1. Check the [Jest documentation](https://jestjs.io/docs/getting-started)
2. Check the [Supertest documentation](https://github.com/visionmedia/supertest)
3. Open an issue on the project repository
