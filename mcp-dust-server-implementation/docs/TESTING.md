# MCP Dust Server Testing Guide

This document provides information about the testing infrastructure and how to run tests for the MCP Dust Server.

## Table of Contents

- [Testing Overview](#testing-overview)
- [Test Types](#test-types)
- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [Test Coverage](#test-coverage)
- [Continuous Integration](#continuous-integration)
- [Troubleshooting](#troubleshooting)

## Testing Overview

The MCP Dust Server uses Jest as the testing framework. Tests are written in TypeScript and are located in the `tests` directory.

The testing infrastructure includes:

- **Unit Tests**: Test individual components in isolation
- **Integration Tests**: Test the interaction between components
- **Mock Services**: Mock external dependencies for testing
- **Test Fixtures**: Provide test data
- **Test Utilities**: Provide helper functions for testing
- **Coverage Reporting**: Track test coverage

## Test Types

### Unit Tests

Unit tests focus on testing individual components in isolation. They are located in the `tests/unit` directory and are organized to mirror the structure of the `src` directory.

Unit tests should:

- Test a single component or function
- Mock all external dependencies
- Be fast and deterministic
- Cover all code paths
- Test both success and error cases

### Integration Tests

Integration tests focus on testing the interaction between components. They are located in the `tests/integration` directory and are organized by feature.

Integration tests should:

- Test the interaction between multiple components
- Use mock services for external dependencies
- Test API endpoints and MCP protocol
- Test authentication and authorization
- Test error handling

## Running Tests

### Running All Tests

To run all tests:

```bash
npm test
```

### Running Unit Tests

To run only unit tests:

```bash
npm run test:unit
```

### Running Integration Tests

To run only integration tests:

```bash
npm run test:integration
```

### Running Tests with Coverage

To run tests with coverage reporting:

```bash
npm run test:coverage
```

This will generate a coverage report in the `coverage` directory.

### Running Tests in Watch Mode

To run tests in watch mode (tests will re-run when files change):

```bash
npm run test:watch
```

### Running Tests in CI Mode

To run tests in CI mode (with JUnit reporter):

```bash
npm run test:ci
```

### Clearing the Jest Cache

If you encounter issues with tests, you can clear the Jest cache:

```bash
npm run test:clear-cache
```

## Writing Tests

### Test File Naming

Test files should be named with the `.test.ts` extension and should be located in the appropriate directory:

- Unit tests: `tests/unit/<path>/<file>.test.ts`
- Integration tests: `tests/integration/<feature>/<file>.test.ts`

### Test Structure

Tests should follow the AAA (Arrange, Act, Assert) pattern:

```typescript
describe('Component', () => {
  describe('method', () => {
    it('should do something', () => {
      // Arrange
      const component = new Component();
      const input = 'test';
      
      // Act
      const result = component.method(input);
      
      // Assert
      expect(result).toBe('expected result');
    });
  });
});
```

### Using Mocks

The `tests/mocks` directory contains mock implementations of services and dependencies. Use these mocks in your tests to isolate the component being tested.

```typescript
import { createMockDustService } from '../../mocks/mockDustService';

// Mock the DustService
jest.mock('../../../src/services/dustService', () => {
  return {
    DustService: jest.fn().mockImplementation(() => createMockDustService()),
  };
});
```

### Using Fixtures

The `tests/fixtures` directory contains test data. Use these fixtures in your tests to provide consistent test data.

```typescript
import { workspaces } from '../../fixtures/workspaces';

// Use the fixture data
const workspace = workspaces[0];
```

### Using Test Utilities

The `tests/utils` directory contains helper functions for testing. Use these utilities in your tests to simplify common tasks.

```typescript
import { createTestToken } from '../../utils/test-utils';

// Create a test token
const token = createTestToken();
```

## Test Coverage

The project aims for high test coverage:

- **Branches**: 70%
- **Functions**: 80%
- **Lines**: 80%
- **Statements**: 80%

To view the coverage report, run:

```bash
npm run test:coverage
```

Then open `coverage/lcov-report/index.html` in a web browser.

## Continuous Integration

The project uses GitHub Actions for continuous integration. The CI pipeline runs on every push to the main branch and on every pull request.

The CI pipeline includes:

- **Linting**: Check code style and quality
- **Testing**: Run all tests
- **Building**: Build the project
- **Security Scanning**: Check for security vulnerabilities
- **Docker Build**: Build and push a Docker image (only on main branch)

## Troubleshooting

### Tests Fail with "Cannot find module"

If tests fail with a "Cannot find module" error, try clearing the Jest cache:

```bash
npm run test:clear-cache
```

### Tests Fail with "Timeout"

If tests fail with a timeout error, the test might be taking too long to complete. Try increasing the timeout in the test:

```typescript
jest.setTimeout(30000); // 30 seconds
```

### Tests Fail with "Connection Refused"

If tests fail with a "Connection refused" error, the test might be trying to connect to a real service instead of a mock. Make sure all external services are properly mocked.

### Tests Pass Locally but Fail in CI

If tests pass locally but fail in CI, there might be environment-specific issues. Check the CI logs for details and try to reproduce the issue locally with the same environment variables.
