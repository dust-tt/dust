Debugging Vitest tests in the front package

This repository is configured so you can reliably hit breakpoints when running tests under a debugger, while keeping the default behavior optimized for isolation and performance in CI and regular runs.

How it works

- By default, Vitest runs with a pool of forked processes so each test file is isolated and can rely on CLS-based transaction isolation.
- When a debugger is detected, Vitest automatically switches to a single-threaded worker pool so the Node inspector can attach to the worker running your tests and breakpoints will hit.

Ways to enable debug mode

- Option A: Set an environment variable.
  - VITEST_DEBUG=1 pnpm --filter front test:watch
  - Or: VITEST_DEBUG=1 pnpm --filter front vitest --inspect-brk

- Option B: Start Vitest with Node’s inspector flags.
  - node --inspect-brk $(pnpm bin)/vitest --watch
  - Or configure your IDE to run Vitest with --inspect or --inspect-brk.

Behavior summary

- Debug mode ON (via VITEST_DEBUG=1 or --inspect/--inspect-brk):
  - pool: "threads"
  - singleThread: true
  - Breakpoints in tests will stop reliably.

- Debug mode OFF (default):
  - pool: "forks"
  - Multiple forks for parallelism and isolation remain enabled, matching CI.

Notes

- CI behavior is unchanged; it continues using forks for isolation and performance.
- No application runtime behavior is affected outside of test runs.
