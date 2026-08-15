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
| Rust filesystem unit tests | Passed | 29 Linux-targeted tests |
| Full Rust unit suite | Failed outside filesystem | 359 passed; see below |
| Rust formatting | Passed | `cargo fmt --check` |
| Rust clippy | Passed with merged-code exception | See below |
| Linux release build | Passed | `x86_64-unknown-linux-musl` |
| Linux FUSE acceptance test | Passed | Fresh `dust-base_0-8-83` sandbox |
| Live sandbox end-to-end test | Passed | gcsfuse and Dust FUSE comparison |
| Shared Pod mount test | Passed | Two Dust sandboxes, revisions and CAS checked |

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
- The first live write failed because the Rust client ignored two headers that Front had signed into
  the GCS upload URL. GCS rejected the PUT. The client now sends every returned header and has a
  loopback test that checks them; the next complete live run passed.
- The shell acceptance script still expected arbitrary `chmod 600`, while the reviewed API stores
  only executable bits. The test now checks `chmod +x` and `chmod -x` and passes in a fresh sandbox.

## Final live run

The latest combined result is `/private/tmp/dust-filesystem-benchmark-store-hardening.json`. It used three
fresh `dust-base_0-8-83` sandboxes and Linux binary SHA-256
`3891773d689283bb5b1476e9aaf9fa849c6d043e36095a13333138244eb4a335`.

- The shell acceptance cases passed before timing began.
- A truncating overwrite advanced revision 1 to 2, not by two revisions.
- Five conversation-to-Pod moves preserved inode identity. Their p50 was 229 ms; the five gcsfuse
  copy/delete moves had a 4,209 ms p50.
- Dust FUSE write plus `fsync` p50 was 875 ms for 4 KiB, 1,336 ms for 1 MiB, and 1,839 ms for 8 MiB.
  Each was faster than the same run through gcsfuse.
- Two Dust sandboxes mounted the same Pod. Five overwrites each increased revision by one and became
  visible on the other mount after 155–1,090 ms. Rename kept the same inode and revision.
- Two writers raced from revision 1. One committed revision 2; the other received `ESTALE`. Both
  mounts then read the winner.
- The same acceptance workload passed with a zero-byte content cache. This covers the case where a
  newly opened file must stay usable even though every closed cache entry is evicted immediately.
- The runner destroyed every sandbox and removed its path-scoped fixtures. The temporary Front API
  and HTTPS tunnel were stopped after the run.

The full timing table is in `cli/dust-sandbox/docs/database-filesystem.md`.

## Rust branch split

The Rust code is split into three stacked branches:

1. `flav/dust-filesystem-rust-client` at `c7f02fc291` adds the typed Front client, request retries,
   error mapping, and signed GCS transfers. Eleven focused tests pass.
2. `flav/dust-filesystem-rust-store` at `04b21c8a8f` adds the inode mapping, staged-file store, and
   bounded caches. The store owns open-file pins, writer slots, commit state, and eviction. Twenty-six
   focused tests pass.
3. `flav/dust-filesystem-rust-mount` at `d945baf032` adds the Linux FUSE callbacks, mount command,
   restart supervisor, acceptance scripts, benchmarks, and current design note. Mount state and
   syscall callbacks are in separate files. Twenty-nine Linux-targeted tests, Clippy, and the optimized
   Linux build pass.

The third branch exposes one `filesystem` command from the module. The client, inode mapping, local
store, FUSE callbacks, and supervisor remain private files behind that command.
