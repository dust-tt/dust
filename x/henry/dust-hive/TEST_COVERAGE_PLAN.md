# Plan: Comprehensive dust-hive Test Coverage

## Problem Statement

The current test suite has significant gaps:
- **13/17 commands** have no integration tests
- **E2E tests use mock services** (`sleep 300` instead of real SDK)
- **Error handling** largely untested
- **Critical features untested**: zellij, forward daemon, cache, doctor, sync

## Test Categories

We'll organize tests into 3 tiers based on speed and dependencies:

| Tier | Location | Requires | Speed | Purpose |
|------|----------|----------|-------|---------|
| 1 | `tests/commands/*.test.ts` | Nothing | Fast | Command logic with mocked deps |
| 2 | `tests/integration/*.test.ts` | Docker | Medium | Infrastructure integration |
| 3 | `tests/e2e/*.test.ts` | Everything | Slow | Full workflows |

---

## Phase 1: Command Unit Tests (Tier 1)

Create `tests/commands/` directory with unit tests for command logic.
These mock external dependencies (Bun.spawn, file I/O) and test:
- Input validation
- Error conditions
- Output formatting

### Files to Create

#### 1.1 `tests/commands/doctor.test.ts`
Test the prerequisite checker:
- All checks pass → success
- Individual check failures → appropriate error messages
- Version string parsing edge cases
- Optional checks (sccache) vs required checks
- Missing commands vs commands that error

#### 1.2 `tests/commands/cache.test.ts`
Test cache management:
- Show status with no cache source configured
- Show status with missing binaries
- Rebuild with cargo failures
- Partial rebuild (some succeed, some fail)

#### 1.3 `tests/commands/forward.test.ts`
Test port forwarding command:
- Environment not found
- Front service not running
- Forwarder already running
- Status display formatting
- Stop when not running

#### 1.4 `tests/commands/sync.test.ts`
Test sync workflow:
- Uncommitted changes blocks sync
- Git fetch failure
- Rebase conflicts detected
- npm install failures (parallel)
- Success path

#### 1.5 `tests/commands/url.test.ts`
Simple command:
- Returns correct URL format
- Handles missing environment

#### 1.6 `tests/commands/logs.test.ts`
Test log viewing:
- Service not found
- Log file doesn't exist
- Correct path construction

---

## Phase 2: Missing Integration Tests (Tier 2)

Extend existing integration test files and add new ones.

### Files to Create/Modify

#### 2.1 `tests/integration/commands.test.ts` (NEW)
Integration tests for commands that need real file/process operations:

```typescript
describe("cool command", () => {
  it("stops services but keeps SDK running");
  it("errors when environment is not warm");
});

describe("start command", () => {
  it("starts SDK from stopped state");
  it("is idempotent when already running");
});

describe("stop command", () => {
  it("stops all services including SDK");
  it("is idempotent when already stopped");
});

describe("restart command", () => {
  it("restarts a specific service");
  it("errors for unknown service");
});
```

#### 2.2 `tests/integration/forward.test.ts` (NEW)
Test the forward daemon with real networking:

```typescript
describe("forward daemon", () => {
  it("forwards TCP connections to target port");
  it("handles upstream connection timeout");
  it("handles client disconnect during connection");
  it("respects buffer limits");
  it("stops cleanly on SIGTERM");
});

describe("forward command integration", () => {
  it("starts forwarder when front is running");
  it("switches target when called with different env");
  it("status shows correct forwarding state");
});
```

#### 2.3 `tests/integration/zellij.test.ts` (NEW)
Test zellij session management (auto-skips if zellij unavailable):

```typescript
describe("zellij sessions", () => {
  it("creates session with correct layout");
  it("open attaches to existing session");
  it("reload kills and recreates session");
  it("destroy cleans up session");
});
```

#### 2.4 `tests/integration/cache.test.ts` (NEW)
Test binary caching with real file operations:

```typescript
describe("cache system", () => {
  it("detects missing binaries correctly");
  it("symlinks work after cache setup");
  it("rebuild creates expected binaries");
});
```

---

## Phase 3: Error Handling Tests

Add error scenario tests across all tiers.

### 3.1 Add to existing `e2e.test.ts`

```typescript
describe("error recovery", () => {
  it("spawn fails gracefully with invalid name");
  it("warm handles port conflicts");
  it("destroy --force cleans up despite errors");
  it("handles stale PID files");
});
```

### 3.2 Add to `lifecycle.test.ts`

```typescript
describe("state inconsistencies", () => {
  it("detects SDK running but Docker stopped");
  it("handles orphaned processes on ports");
  it("recovers from partial warm failure");
});
```

### 3.3 Create `tests/integration/errors.test.ts`

```typescript
describe("error scenarios", () => {
  it("handles corrupted metadata.json");
  it("handles missing worktree directory");
  it("handles docker compose syntax errors");
  it("handles service crash during warm");
});
```

---

## Phase 4: Test Infrastructure Improvements

### 4.1 Add test markers/tags

Update `package.json` with granular test scripts:
```json
{
  "test:unit": "bun test tests/lib tests/commands",
  "test:integration:fast": "bun test tests/integration --grep 'filesystem|git|process'",
  "test:integration:docker": "bun test tests/integration --grep 'docker|lifecycle'",
  "test:e2e": "bun test tests/e2e",
  "test:all": "bun test",
  "test:coverage": "bun test --coverage"
}
```

### 4.2 Add coverage reporting

Add to `bunfig.toml`:
```toml
[test]
coverage = true
coverageDir = "./coverage"
```

Coverage will be informational only (no threshold enforcement).

### 4.3 Add test documentation

Create `tests/README.md` documenting:
- Which tests require Docker
- Which tests require zellij (auto-skipped if unavailable)
- Expected timeouts
- How to run subsets

### 4.4 Zellij test skipping

Tests in `zellij.test.ts` will auto-skip when zellij is not available:
```typescript
beforeAll(() => {
  if (!isZellijAvailable()) {
    console.log("Skipping zellij tests - zellij not found");
    return; // Bun will skip the suite
  }
});
```

---

## Implementation Order

### Batch 1: Quick wins (command unit tests)
1. `tests/commands/doctor.test.ts` - Easiest, pure mocking
2. `tests/commands/url.test.ts` - Trivial
3. `tests/commands/cache.test.ts` - Simple file mocking
4. `tests/commands/logs.test.ts` - Simple

### Batch 2: Medium effort (command tests with more logic)
5. `tests/commands/forward.test.ts` - State management
6. `tests/commands/sync.test.ts` - Git/npm mocking

### Batch 3: Integration tests
7. `tests/integration/commands.test.ts` - cool/start/stop/restart
8. `tests/integration/errors.test.ts` - Error scenarios
9. `tests/integration/forward.test.ts` - Real TCP forwarding

### Batch 4: Infrastructure & optional
10. `tests/integration/zellij.test.ts` - Auto-skips if zellij unavailable
11. `tests/README.md` - Documentation
12. Coverage setup in `bunfig.toml` and `package.json`

---

## Files to Create

```
tests/
├── commands/           # NEW directory
│   ├── doctor.test.ts
│   ├── cache.test.ts
│   ├── forward.test.ts
│   ├── sync.test.ts
│   ├── url.test.ts
│   └── logs.test.ts
├── integration/
│   ├── commands.test.ts    # NEW - cool/start/stop/restart
│   ├── errors.test.ts      # NEW - error scenarios
│   ├── forward.test.ts     # NEW - TCP forwarding
│   ├── zellij.test.ts      # NEW - session management (auto-skip)
│   └── ... (existing files)
└── README.md               # NEW - test documentation
bunfig.toml                 # MODIFY - add coverage config
package.json                # MODIFY - add test scripts
```

---

## Success Criteria

After implementation:
- [ ] All 17 commands have at least basic test coverage
- [ ] Error scenarios tested for spawn, warm, destroy, forward
- [ ] Forward daemon TCP forwarding verified
- [ ] Zellij tests auto-skip when zellij unavailable
- [ ] Coverage reporting enabled (informational)
- [ ] Test documentation explains how to run different suites
- [ ] `bun run check` passes with all new tests
