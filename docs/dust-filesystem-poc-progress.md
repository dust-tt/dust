# Dust filesystem PoC progress

This file records what was merged, what was changed, and which checks passed. It is kept on
`flav/minimal-dust-fuse` so the PoC can be reviewed or rolled back without relying on chat history.

## Plan

1. Merge the latest `main` into the existing PoC. Keep the PoC daemon and adapters; do not rebuild
   them in Front.
2. Use the namespace, content, rename, and executable-bit code already merged on `main`.
3. Adapt only the PoC-only wiring needed to mount the database filesystem in a sandbox.
4. Run the Front tests, Rust tests, FUSE acceptance tests, and a live sandbox test.
5. Record every missing case found by those checks.
6. Split the Rust work into at most three reviewable branches.

## Current state

- PoC baseline: `4d779969bf` (`flav/minimal-dust-fuse`).
- `main` merged from: `a119e2e145`.
- Merge commit: `95a7d358c5`.
- Merge method: merge commit, not rebase. The PoC history remains unchanged and the merge can be
  reverted as one commit.
- Duplicate Front namespace, Resource, model, and migration conflicts were resolved using `main` as
  the source of truth.
- The PoC-only Front endpoint, mount adapter, token, and Rust client now use the merged request and
  response types.

## Verification

| Check | Status | Result |
| --- | --- | --- |
| Front filesystem namespace tests | Passed | 24 tests |
| Front database backend tests | Passed | 2 tests |
| Front sandbox mount adapter and token tests | Passed | 10 tests |
| Front filesystem endpoint tests | Passed | 4 tests |
| Front typecheck | Passed | `tsgo --noEmit` |
| Front API typecheck | Failed outside filesystem | See below |
| Rust filesystem unit tests | Passed | 18 Linux-targeted tests |
| Full Rust unit suite | Failed outside filesystem | 359 passed; see below |
| Rust formatting | Passed | `cargo fmt --check` |
| Rust clippy | Passed with merged-code exception | See below |
| Linux release build | Passed | `x86_64-unknown-linux-musl` |
| Linux FUSE acceptance test | Pending | Needs a Front URL reachable from E2B |
| Live sandbox end-to-end test | Pending | Needs a Front URL reachable from E2B |
| Shared Pod mount test | Pending | Needs a Front URL reachable from E2B |

## Missing cases found

- The full Rust suite reaches all filesystem tests, but five tests in `commands::function` fail on
  macOS. `warm_cycle_end_to_end` cannot import its temporary `greet__environment.ts`; that panic
  poisons the shared environment lock and causes four later function tests to fail. This is merged
  function-runner code, not a filesystem failure. The filesystem-only suite is run separately.
- Strict Clippy finds `clippy::format_collect` twice in the same merged function-warm module.
  Running Clippy with only that existing lint allowed passes every target. The PoC does not change
  those lines.
- The Front API typecheck reaches the filesystem endpoint but fails in the merged conversation
  route: it switches on `invalid_request_error`, which is not part of that operation's error type.
  The PoC does not change that route.
- `FileSystemContentResource.writeContent` buffers a `Readable` before upload. The sandbox daemon
  streams files from its staging file and does not use this path, but the app-side adapter should
  stream large inputs before it becomes the main application write path.
- The live runner is ready, but E2B cannot reach a local Front process directly. Opening a temporary
  HTTPS tunnel would expose an authenticated local filesystem endpoint, so that step needs explicit
  approval before the live run.

## Rust branch split

The Rust code is split into three stacked branches:

1. `flav/dust-filesystem-rust-client` at `f8adf5efe7` adds the typed Front client, request retries,
   error mapping, and signed GCS transfers. Five focused tests pass.
2. `flav/dust-filesystem-rust-store` at `caf0d78392` adds the inode mapping, staged-file store, and
   bounded caches. Fifteen focused tests pass.
3. `flav/dust-filesystem-rust-mount` at `7197f35200` adds the Linux FUSE callbacks, mount command,
   restart supervisor, acceptance scripts, benchmarks, and current design note. Mount state and
   syscall callbacks are in separate files. Eighteen Linux-targeted tests, Clippy, and the optimized
   Linux build pass.

The third branch exposes one `filesystem` command from the module. The client, inode mapping, local
store, FUSE callbacks, and supervisor remain private files behind that command.
