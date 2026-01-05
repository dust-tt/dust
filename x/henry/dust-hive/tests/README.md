# dust-hive Test Suite

This directory contains tests for the dust-hive CLI tool.

## Test Structure

```
tests/
├── lib/                    # Unit tests for library modules
│   ├── docker.test.ts
│   ├── environment.test.ts
│   ├── envgen.test.ts
│   ├── init.test.ts
│   ├── paths.test.ts
│   ├── ports.test.ts
│   ├── registry.test.ts
│   ├── result.test.ts
│   ├── services.test.ts
│   ├── shell.test.ts
│   └── state.test.ts
├── commands/               # Unit tests for command logic
│   ├── cache.test.ts
│   ├── doctor.test.ts
│   ├── forward.test.ts
│   ├── logs.test.ts
│   ├── sync.test.ts
│   └── url.test.ts
├── integration/            # Integration tests (require Docker)
│   ├── cleanup.ts          # Cleanup utilities
│   ├── setup.ts            # Test setup utilities
│   ├── commands.test.ts    # cool/start/stop/restart
│   ├── docker.test.ts      # Docker operations
│   ├── e2e.test.ts         # End-to-end workflows
│   ├── errors.test.ts      # Error scenarios
│   ├── filesystem.test.ts  # File operations
│   ├── forward.test.ts     # Port forwarding
│   ├── git.test.ts         # Git operations
│   ├── lifecycle.test.ts   # Environment lifecycle
│   ├── process.test.ts     # Process management
│   └── zellij.test.ts      # Zellij sessions (auto-skips if unavailable)
└── README.md               # This file
```

## Test Categories

### Unit Tests (`tests/lib/` and `tests/commands/`)

Fast tests that don't require external dependencies.

- **Speed**: < 1 second
- **Dependencies**: None
- **Run with**: `bun test tests/lib` or `bun test tests/commands`

### Integration Tests (`tests/integration/`)

Tests that require Docker and interact with the system.

- **Speed**: 5-60 seconds depending on the test
- **Dependencies**: Docker must be running
- **Run with**: `bun test tests/integration`

## Running Tests

### All Tests (Unit Only - Default)

```bash
bun run test
```

### Unit Tests Only

```bash
bun test tests/lib
bun test tests/commands
```

### Integration Tests

```bash
# Requires Docker to be running
bun run test:integration
```

### Fast Integration Tests (No Docker)

```bash
bun run test:integration:fast
```

### E2E Tests

```bash
# Full end-to-end test (slowest)
bun run test:e2e
```

### All Tests (Including Integration)

```bash
bun run test:all
```

### Watch Mode

```bash
bun run test:watch
```

## Requirements

### For Unit Tests
- Bun runtime

### For Integration Tests
- Bun runtime
- Docker Desktop (running)
- ~500MB free disk space for containers

### For Zellij Tests
- Zellij terminal multiplexer (optional - tests auto-skip if not available)
- Install with: `brew install zellij`

## Test Timeouts

| Test Type | Expected Duration |
|-----------|-------------------|
| Unit tests | < 100ms each |
| Integration (fast) | 1-5s each |
| Integration (Docker) | 5-30s each |
| E2E | 30-120s total |

## Writing New Tests

### Unit Tests

```typescript
import { describe, expect, it } from "bun:test";

describe("my feature", () => {
  it("does something", () => {
    expect(true).toBe(true);
  });
});
```

### Integration Tests

```typescript
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { cleanupTestEnvironment, registerCleanup, runAllCleanups } from "./cleanup";
import { createTestContext, requireDocker, type TestContext } from "./setup";

beforeAll(async () => {
  await requireDocker();
});

describe("my integration test", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext("prefix");
  });

  afterEach(async () => {
    await runAllCleanups();
    await ctx.cleanup();
  });

  it("does something", async () => {
    // Register cleanup for any resources created
    registerCleanup(async () => {
      await cleanupTestEnvironment(ctx.envName);
    });

    // Test code here
  });
});
```

### Auto-Skip Pattern (for Optional Dependencies)

```typescript
let featureAvailable = false;

beforeAll(async () => {
  featureAvailable = await checkFeatureAvailable();
});

it("tests feature", async () => {
  if (!featureAvailable) {
    console.log("  ⏭️  Skipped: feature not available");
    return;
  }

  // Test code here
});
```

## Troubleshooting

### "Docker is required for integration tests"

Start Docker Desktop and try again.

### Tests hang or timeout

- Check if Docker containers are stuck: `docker ps -a`
- Clean up: `docker system prune -f`

### Port conflicts

Tests use ports 50000-59000 to avoid conflicts. If you see port errors:
- Check for orphaned processes: `lsof -i :50000-59999`
- Kill orphaned processes manually

### Cleanup failures

If tests leave behind resources:
- Environments: `rm -rf ~/.dust-hive/envs/int-*`
- Worktrees: `rm -rf ~/dust-hive/int-*`
- Docker: `docker compose -p "dust-hive-int*" down -v`
