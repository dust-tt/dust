# MCP Server Testing Guide

This guide covers how to write tests for MCP (Model Context Protocol) servers in the Dust codebase.

## Prerequisites

Before running tests, ensure your local environment has:

- PostgreSQL test database running (e.g., `postgres://dev:dev@localhost:5432/dust_front_test`)
- Redis instance running (e.g., `redis://localhost:6379`)
- Environment variables set:
  ```bash
  NODE_ENV=test
  FRONT_DATABASE_URI=postgres://dev:dev@localhost:5432/dust_front_test
  REDIS_URI=redis://localhost:6379
  REDIS_CACHE_URI=redis://localhost:6379
  ```

## Overview

MCP servers provide tools that agents can use during conversations. Testing these servers ensures that:

1. Tools execute correctly with valid inputs
2. Appropriate errors are returned for invalid inputs
3. Server behavior matches expectations across different scenarios
4. Changes don't break existing functionality

## Test Infrastructure

The testing infrastructure provides two main utilities:

### MCPTestUtils

Helper functions for creating test clients and asserting tool results.

**Location**: `/front/tests/utils/MCPTestUtils.ts`

**Key methods**:

- `createTestClient()` - Creates an MCP client connected to a server
- `assertToolSuccess()` - Asserts that a tool call succeeded
- `assertToolError()` - Asserts that a tool call failed
- `listTools()` - Lists all tools available from a server

### AgentLoopContextFactory

Factory for creating `AgentLoopContext` instances needed by servers.

**Location**: `/front/tests/utils/AgentLoopContextFactory.ts`

**Key methods**:

- `createRunContext()` - Creates a full context with agent, conversation, and messages
- `createMinimalContext()` - Creates a minimal context for simple tests

## Writing Tests

### Basic Test Structure

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import type { Authenticator } from "@app/lib/auth";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPTestUtils } from "@app/tests/utils/MCPTestUtils";
import { AgentLoopContextFactory } from "@app/tests/utils/AgentLoopContextFactory";

describe("my_server MCP server", () => {
  let auth: Authenticator;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    auth = setup.authenticator;
  });

  describe("my_tool", () => {
    it("should execute successfully", async () => {
      // Arrange: Set up test data
      const agentLoopContext = await AgentLoopContextFactory.createRunContext(auth);

      const { client, cleanup } = await MCPTestUtils.createTestClient(
        auth,
        "my_server",
        agentLoopContext
      );

      try {
        // Act: Call the tool
        const result = await client.callTool({
          name: "my_tool",
          arguments: { param: "value" },
        });

        // Assert: Verify results
        const content = MCPTestUtils.assertToolSuccess(result);
        expect(content[0].text).toContain("expected output");
      } finally {
        await cleanup();
      }
    });
  });
});
```

### Testing Success Cases

Use `MCPTestUtils.assertToolSuccess()` to verify successful tool execution:

```typescript
it("should return correct data", async () => {
  const { client, cleanup } = await MCPTestUtils.createTestClient(
    auth,
    "my_server",
    agentLoopContext
  );

  try {
    const result = await client.callTool({
      name: "my_tool",
      arguments: { id: "test-123" },
    });

    // Assert success and extract content
    const content = MCPTestUtils.assertToolSuccess(result);

    // Verify content structure
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe("text");
    expect(content[0].text).toContain("expected output");
  } finally {
    await cleanup();
  }
});
```

### Testing Error Cases

Use `MCPTestUtils.assertToolError()` to verify error handling:

```typescript
it("should return error for invalid input", async () => {
  const { client, cleanup } = await MCPTestUtils.createTestClient(
    auth,
    "my_server",
    agentLoopContext
  );

  try {
    const result = await client.callTool({
      name: "my_tool",
      arguments: { id: "invalid" },
    });

    // Assert error and extract error message
    const errorMessage = MCPTestUtils.assertToolError(result);
    expect(errorMessage).toContain("not found");
  } finally {
    await cleanup();
  }
});
```

### Testing Without Context

Some tools don't require agent loop context. Test these by omitting the context parameter:

```typescript
it("should work without agent context", async () => {
  // No agentLoopContext provided
  const { client, cleanup } = await MCPTestUtils.createTestClient(
    auth,
    "my_server"
  );

  try {
    const result = await client.callTool({
      name: "my_tool",
      arguments: {},
    });

    const content = MCPTestUtils.assertToolSuccess(result);
    expect(content).toBeDefined();
  } finally {
    await cleanup();
  }
});
```

### Testing Tool Registration

Verify that tools are correctly registered:

```typescript
it("should list all available tools", async () => {
  const { client, cleanup } = await MCPTestUtils.createTestClient(
    auth,
    "my_server"
  );

  try {
    const tools = await MCPTestUtils.listTools(client);

    // Verify tool is registered
    const myTool = tools.find((t) => t.name === "my_tool");
    expect(myTool).toBeDefined();
    expect(myTool?.description).toContain("expected description");
    expect(myTool?.inputSchema).toBeDefined();
  } finally {
    await cleanup();
  }
});
```

## Common Testing Patterns

### Testing with Resources

When tools interact with resources, use factories to create test data:

```typescript
import { SkillFactory } from "@app/tests/utils/SkillFactory";

it("should process skill correctly", async () => {
  // Create test resource
  const skill = await SkillFactory.create(auth, {
    name: "TestSkill",
    status: "active",
  });

  const agentLoopContext = await AgentLoopContextFactory.createRunContext(auth);
  const { client, cleanup } = await MCPTestUtils.createTestClient(
    auth,
    "my_server",
    agentLoopContext
  );

  try {
    const result = await client.callTool({
      name: "process_skill",
      arguments: { skillName: skill.name },
    });

    const content = MCPTestUtils.assertToolSuccess(result);
    expect(content[0].text).toContain(skill.name);
  } finally {
    await cleanup();
  }
});
```

### Testing with Multiple Agents

Test scenarios involving multiple agents:

```typescript
it("should work with different agents", async () => {
  // Create first agent context
  const firstContext = await AgentLoopContextFactory.createRunContext(auth, {
    agentConfig: { name: "First Agent" },
  });

  // Create second agent context
  const secondContext = await AgentLoopContextFactory.createRunContext(auth, {
    agentConfig: { name: "Second Agent" },
  });

  const { client: firstClient, cleanup: cleanup1 } =
    await MCPTestUtils.createTestClient(auth, "my_server", firstContext);

  const { client: secondClient, cleanup: cleanup2 } =
    await MCPTestUtils.createTestClient(auth, "my_server", secondContext);

  try {
    // Test with first agent
    const result1 = await firstClient.callTool({
      name: "my_tool",
      arguments: {},
    });
    MCPTestUtils.assertToolSuccess(result1);

    // Test with second agent
    const result2 = await secondClient.callTool({
      name: "my_tool",
      arguments: {},
    });
    MCPTestUtils.assertToolSuccess(result2);
  } finally {
    await cleanup1();
    await cleanup2();
  }
});
```

### Testing Side Effects

Verify that tools produce expected side effects:

```typescript
it("should link skill to agent", async () => {
  const skill = await SkillFactory.create(auth, {
    name: "TestSkill",
    status: "active",
  });

  const agentLoopContext = await AgentLoopContextFactory.createRunContext(auth);
  const { client, cleanup } = await MCPTestUtils.createTestClient(
    auth,
    "skill_management",
    agentLoopContext
  );

  try {
    // Call tool
    const result = await client.callTool({
      name: "enable_skill",
      arguments: { skillName: skill.name },
    });

    MCPTestUtils.assertToolSuccess(result);

    // Verify side effect
    const linkedSkills = await skill.getLinkedAgentConfigurations(auth);
    const agentConfig = agentLoopContext.runContext!.agentConfiguration;
    expect(linkedSkills.some((a) => a.sId === agentConfig.sId)).toBe(true);
  } finally {
    await cleanup();
  }
});
```

## Test Organization

### Single-File Servers

For single-file servers (e.g., `skill_management.ts`), create a colocated test file:

```
servers/
├── skill_management.ts
└── skill_management.test.ts
```

### Folder-Based Servers

For folder-based servers, create tests in a `__tests__` subdirectory:

```
servers/
├── project_context_management/
│   ├── index.ts
│   ├── file_operations.ts
│   ├── metadata_operations.ts
│   └── __tests__/
│       ├── file_operations.test.ts
│       └── metadata_operations.test.ts
```

## Available Factories

Use these factories to create test data:

- `AgentConfigurationFactory` - Create test agents
- `ConversationFactory` - Create conversations with messages
- `SkillFactory` - Create skills
- `DataSourceViewFactory` - Create data sources
- `SpaceFactory` - Create spaces
- `MembershipFactory` - Create workspace memberships
- `UserFactory` - Create users

See `/front/tests/utils/` for full list of available factories.

## Running Tests

### Run all MCP server tests

```bash
cd front
npm test -- lib/actions/mcp_internal_actions/servers
```

### Run specific server tests

```bash
npm test -- lib/actions/mcp_internal_actions/servers/skill_management.test.ts
```

### Run tests in watch mode

```bash
npm test -- --watch skill_management.test.ts
```

## Best Practices

1. **Always use cleanup**: Use try/finally to ensure cleanup runs even if tests fail
2. **Test error cases**: Don't just test happy paths
3. **Use factories**: Create test data with factories, not raw Sequelize models
4. **Verify side effects**: Check that tools produce expected changes
5. **Test isolation**: Each test should be independent and not rely on other tests
6. **Clear test names**: Use descriptive test names that explain what's being tested
7. **Arrange-Act-Assert**: Structure tests with clear setup, execution, and verification

## Mocking External Services

When testing servers that call external APIs, mock the API clients:

```typescript
import { vi } from "vitest";

// Mock the external API
vi.mock("@dust-tt/client", () => ({
  DustAPI: vi.fn().mockImplementation(() => ({
    postUserMessage: vi.fn().mockResolvedValue({
      conversation: { sId: "test-conversation" },
    }),
  })),
}));

it("should call external API", async () => {
  const { DustAPI } = await import("@dust-tt/client");
  const mockAPI = vi.mocked(DustAPI);

  const { client, cleanup } = await MCPTestUtils.createTestClient(
    auth,
    "my_server",
    agentLoopContext
  );

  try {
    await client.callTool({
      name: "call_external_api",
      arguments: {},
    });

    // Verify API was called
    expect(mockAPI.prototype.postUserMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: expect.any(String),
      })
    );
  } finally {
    await cleanup();
  }
});
```

## Troubleshooting

### "Not connected" error

Ensure you're calling `cleanup()` after tests:

```typescript
try {
  // test code
} finally {
  await cleanup();
}
```

### "No conversation context available" error

Some tools require agent loop context. Provide it when creating the client:

```typescript
const agentLoopContext = await AgentLoopContextFactory.createRunContext(auth);
const { client, cleanup } = await MCPTestUtils.createTestClient(
  auth,
  "my_server",
  agentLoopContext  // Add this parameter
);
```

### Type errors with Content

Ensure you're importing types from the correct package:

```typescript
import type { Content } from "@modelcontextprotocol/sdk/types.js";
```

## Reference Example

See `skill_management.test.ts` for a complete reference implementation demonstrating:

- Success case testing
- Error case testing
- Context-dependent testing
- Tool listing verification
- Side effect verification
- Multi-agent scenarios

## Further Reading

- [Vitest Documentation](https://vitest.dev/)
- [MCP SDK Documentation](https://modelcontextprotocol.io/)
- [Dust Testing Guide](/front/runbooks/TEST.md)
