# Contributing to MCP Dust Server

Thank you for considering contributing to the MCP Dust Server! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Workflow](#development-workflow)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Testing Guidelines](#testing-guidelines)
- [Documentation Guidelines](#documentation-guidelines)

## Code of Conduct

This project and everyone participating in it is governed by the [MCP Dust Server Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the issue tracker to see if the problem has already been reported. If it has, add a comment to the existing issue instead of opening a new one.

When creating a bug report, include as many details as possible:

- **Use a clear and descriptive title** for the issue
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples** to demonstrate the steps
- **Describe the behavior you observed** after following the steps
- **Explain the behavior you expected to see**
- **Include screenshots or animated GIFs** if possible
- **Include details about your environment**

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, include as many details as possible:

- **Use a clear and descriptive title** for the issue
- **Provide a step-by-step description of the suggested enhancement**
- **Provide specific examples** to demonstrate the steps
- **Describe the current behavior** and **explain the behavior you expected to see**
- **Explain why this enhancement would be useful**

### Your First Code Contribution

Unsure where to begin contributing? Look for issues labeled `good first issue` or `help wanted`:

- **Good first issues** - issues that should only require a few lines of code and a test or two
- **Help wanted issues** - issues that are more involved than `good first issue`

### Pull Requests

- Fill in the required template
- Follow the coding standards
- Include tests for your changes
- Update documentation for your changes
- Ensure all tests pass
- Include a clear and descriptive title
- Reference any related issues

## Development Workflow

1. **Fork the repository**
2. **Clone your fork**
   ```bash
   git clone https://github.com/yourusername/mcp-dust-server.git
   cd mcp-dust-server
   ```
3. **Add the upstream repository**
   ```bash
   git remote add upstream https://github.com/originalusername/mcp-dust-server.git
   ```
4. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```
5. **Make your changes**
6. **Commit your changes**
   ```bash
   git commit -m "Add feature X"
   ```
7. **Push your changes**
   ```bash
   git push origin feature/your-feature-name
   ```
8. **Create a pull request**

## Pull Request Process

1. Update the README.md and documentation with details of changes to the interface, if applicable
2. Update the CHANGELOG.md with details of changes
3. The pull request will be merged once it has been reviewed and approved by a maintainer
4. You may merge the pull request once you have the sign-off of a maintainer, or if you do not have permission to do that, you may request the maintainer to merge it for you

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

## Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification for commit messages:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type

Must be one of the following:

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Changes that do not affect the meaning of the code (white-space, formatting, etc.)
- **refactor**: A code change that neither fixes a bug nor adds a feature
- **perf**: A code change that improves performance
- **test**: Adding missing tests or correcting existing tests
- **chore**: Changes to the build process or auxiliary tools and libraries

### Scope

The scope should be the name of the module affected (e.g., `workspace`, `agent`, `knowledge-base`).

### Subject

The subject contains a succinct description of the change:

- Use the imperative, present tense: "change" not "changed" nor "changes"
- Don't capitalize the first letter
- No dot (.) at the end

### Body

The body should include the motivation for the change and contrast this with previous behavior.

### Footer

The footer should contain any information about Breaking Changes and is also the place to reference GitHub issues that this commit closes.

Breaking Changes should start with the word `BREAKING CHANGE:` with a space or two newlines. The rest of the commit message is then used for this.

## Testing Guidelines

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

## Documentation Guidelines

The MCP Dust Server uses Markdown for documentation:

### API Documentation

API documentation is in the `docs/API.md` file. Update this file when you add or modify API endpoints.

### Architecture Documentation

Architecture documentation is in the `docs/ARCHITECTURE.md` file. Update this file when you make significant changes to the architecture.

### Installation and Configuration

Installation and configuration documentation is in the `docs/INSTALLATION.md` file. Update this file when you change the installation or configuration process.

### Development Guide

Development documentation is in the `docs/DEVELOPMENT.md` file. Update this file when you change the development process.

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

## Questions?

If you have any questions about contributing, please open an issue or contact the project maintainers.
