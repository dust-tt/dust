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
4. **Use factories**: Leverage test factories to set up data efficiently
5. **Focus on behavior**: Test what the code does, not how it does it

## For Front (TypeScript/Next.js)

### Setup

- Import factories from `front/tests/utils/factories`
- Import utilities from `front/tests/utils/utils`
- Use the test database (no mocking)

### Structure

```typescript
import {describe, it, expect} from "vitest";
import {makeTestWorkspace, makeTestUser} from "tests/utils/factories";

describe ("ComponentName or FunctionName", () => {
    it ("should handle the main happy path", async () => {
        // Arrange: Set up using factories
        const {workspace} = createResourceTest ()

        // Act: Execute the code
        const result = await functionUnderTest (workspace);

        // Assert: Verify behavior
        expect (result).toBeDefined ();
    });

    it ("should handle the most common edge case", async () => {
        // Test the second most important scenario
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

## Example Pattern

```typescript
describe ("createConversation", () => {
    it ("creates conversation with valid params", async () => {
        const {workspace, user} = createResourceTest ()
   
        const conversation = await createConversation ({
            workspace,
            userId: user.id,
            title: "Test"
        });
   
        expect (conversation.sId).toBeDefined ();
        expect (conversation.title).toBe ("Test");
    });
   
    it ("fails without required permissions", async () => {
        const {workspace, user} = createResourceTest ()
   
        await expect (
            createConversation ({workspace, userId: user.id})
        ).rejects.toThrow ("Permission denied");
    });
});
```

## Execution Steps

1. Read the file to understand its purpose and main exports
2. Check if a test file already exists (e.g., `file.test.ts`)
3. Identify the 2-4 most important functions/behaviors to test
4. Find or create appropriate factories for test data
5. Write concise, focused tests
6. Run tests with `npm test` to verify they pass
