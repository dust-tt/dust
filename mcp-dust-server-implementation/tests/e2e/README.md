# End-to-End Tests for MCP Dust Server

This directory contains end-to-end tests for the MCP Dust Server. These tests verify that the entire system works correctly from the client's perspective.

## Test Structure

The end-to-end tests are organized into the following files:

- `setup.ts`: Common setup and utilities for all tests
- `auth-flow.test.ts`: Tests for the authentication flow
- `mcp-protocol.test.ts`: Tests for the MCP protocol implementation
- `rest-api.test.ts`: Tests for the REST API endpoints
- `taskmaster-integration.test.ts`: Tests for Task Master integration
- `performance.test.ts`: Tests for performance characteristics
- `security.test.ts`: Tests for security features

## Running the Tests

To run the end-to-end tests, use the following command:

```bash
npm run test:e2e
```

This will:
1. Start the MCP Dust Server on port 5002
2. Run all the end-to-end tests
3. Shut down the server when tests are complete

## Configuration

The end-to-end tests use a dedicated configuration file: `.env.e2e`. This file should contain test-specific configuration values, such as:

- Test API keys
- Test workspace and agent IDs
- Test server port
- Reduced timeouts for faster testing

## Writing New Tests

When writing new end-to-end tests:

1. Import the necessary utilities from `setup.ts`
2. Use the `request` object for making HTTP requests
3. Use the `getAuthHeader()` and `getMcpHeaders()` functions for authentication
4. Use the `mcpRequest()` function for making MCP protocol requests

Example:

```typescript
import { request, getAuthHeader, mcpRequest } from './setup.js';

describe('My New Test', () => {
  test('Test something', async () => {
    const response = await request
      .get('/api/v1/some-endpoint')
      .set(getAuthHeader())
      .expect(200);
    
    expect(response.body).toHaveProperty('expectedProperty');
  });
});
```

## Best Practices

- Keep tests independent of each other
- Clean up any resources created during tests
- Use descriptive test names
- Group related tests using `describe` blocks
- Use `beforeAll` and `afterAll` for setup and teardown
- Handle potential test failures gracefully
- Add appropriate timeouts for long-running tests
