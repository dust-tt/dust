---
name: dust-test
description: Step-by-step guide for writing focused, practical tests for Dust codebases following the 80/20 principle.
---

# Creating automated tests for Dust codebases

Write focused, practical tests for the current file following the 80/20 principle.

## Instructions

When writing tests for a file:

1. **Identify the core functionality**: Focus on the most important paths and edge cases that provide 80% of the value
2. **Keep it simple**: Write straightforward tests that are easy to understand and maintain
3. **Minimal mocking**:
    - DO NOT mock the database
    - Only mock external services (APIs, third-party services)
    - Prefer real implementations when possible
4. **Use shared factories**: Set up data with the existing factories, never by hand (see below)
5. **Focus on behavior**: Test what the code does, not how it does it

## For Front and Front-api (TypeScript)

Front-api tests import the same helpers from `@app/tests/utils/...`.

### Setup

Every test runs inside a database transaction that is rolled back afterwards, so tests can create
real records freely without cleanup.

Before writing any helper, look in `front/tests/utils/` for one that already exists:

| Need                                              | Use                                                                                                 |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Workspace + user + membership + `Authenticator`   | `createResourceTest({ role })` from `generic_resource_tests`                                        |
| Request/response for an API route handler         | `createPrivateApiMockRequest`, `createPublicApiMockRequest`, `createPokeApiMockRequest`             |
| A single database record                          | The matching `<Name>Factory` (e.g. `WorkspaceFactory.basic()`, `UserFactory.basic()`, `SpaceFactory.regular(...)`, `AgentConfigurationFactory.createTestAgent(...)`, `ConversationFactory.create(...)`) |
| A plain object for a component or pure-logic test | `LightWorkspaceFactory.build()`, `LightUserFactory.build()`, `LightPlanFactory`, `LightSubscriptionFactory` |
| A mocked service (Redis, file storage, WorkOS...) | `front/tests/utils/mocks/`. Redis, cache, file storage and Temporal are already mocked globally in `front/vite.setup.ts`; do not mock them again |

Rules:

- Do not call `SomeModel.create(...)` or `SomeResource.makeNew(...)` directly in a test to set up data. Use
  the factory.
- Do not build partial objects and cast them (`{ sId: "w_1" } as LightWorkspaceType`). Use the matching
  `Light*Factory.build({ ...overrides })`.
- If a factory exists but does not support what you need (a status, a date, a relation), add an option to
  the factory instead of working around it in the test.
- If no factory exists for a record the test needs, add a new `<Name>Factory.ts` in `front/tests/utils/`
  rather than a local helper in the test file.

### Structure

```typescript
import { describe, expect, it } from "vitest";

import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";

describe("functionUnderTest", () => {
  it("handles the main happy path", async () => {
    // Arrange: set up with shared helpers and factories.
    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent = await AgentConfigurationFactory.createTestAgent(authenticator);

    // Act.
    const result = await functionUnderTest(authenticator, agent.sId);

    // Assert.
    expect(result.isOk()).toBe(true);
  });

  it("rejects callers without permission", async () => {
    const { authenticator } = await createResourceTest({ role: "user" });
    // ...
  });
});
```

### What to test (80/20 focus)

- Main success paths
- Most common error conditions
- Critical edge cases (null/undefined, empty arrays, etc.)
- Permission checks (if applicable)

### What to skip (diminishing returns)

- Exhaustive parameter combinations
- Unlikely edge cases
- Internal implementation details
- UI component rendering (unless critical)

## For Connectors/Core

Follow similar principles:

- Use factories appropriate to the service
- Focus on integration points
- Mock external APIs only (Slack, Notion, GitHub, etc.)
- Test the database interactions directly

## Execution Steps

1. Read the file to understand its purpose and main exports
2. Check if a test file already exists (e.g., `file.test.ts`)
3. Identify the 2-4 most important functions/behaviors to test
4. Check `front/tests/utils/` for the factories and helpers you need; extend or add a factory there if one
   is missing
5. Write concise, focused tests
6. Run tests from `front/` with `npm run test -- path/to/file.test.ts` to verify they pass
