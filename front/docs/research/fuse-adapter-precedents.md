# Modern FUSE adapter precedents and LLM-era effort

Research date: 2026-08-10

## Conclusion

The earlier multi-month estimate was too conservative for reaching a useful Dust prototype. Existing libraries and current examples show that the FUSE translation layer can be very small, and coding agents materially compress the implementation of callback glue, error mapping, protocol clients, and tests.

The remaining work is mostly deciding semantics and proving them against real sandbox workloads. For a deliberately narrow, single-writer-per-pod design, a credible calibration is:

- mountable proof of concept: 1-3 days;
- internal alpha with create/read/write/move/delete and remote API: 1-2 weeks;
- hardened production beta behind a feature flag: roughly 3-6 weeks;
- broad multi-writer POSIX compatibility: still a multi-month storage project.

These are implementation orders of magnitude, not delivery commitments.

## Small generic adapters already exist

### fsspec FUSE bridge

The official `fsspec.fuse` module mounts any fsspec implementation through fusepy. GitHub reports 324 lines / 277 lines of code for the whole module. Its core adapter implements metadata lookup, directory listing, mkdir/rmdir, read/write, create/open, zero-length truncate, unlink, release, and chmod.

This is strong evidence that once a filesystem interface exists, exposing it through FUSE is small. It is not production-complete for Dust: it lacks rename, robust truncate, fsync/durability, stable inode identity, and sophisticated concurrency. But it is close to an ideal fast prototype against a Dust HTTP filesystem client.

Sources:

- [fsspec FUSE source](https://filesystem-spec.readthedocs.io/en/stable/_modules/fsspec/fuse.html)
- [fsspec FUSE feature](https://filesystem-spec.readthedocs.io/en/stable/features.html)

### Generic Go adapters

`go-fuse` provides node/inode abstractions and examples so a project need not implement the raw libfuse protocol. The `absfs/fusefs` project demonstrates a generic adapter that maps an existing Go filesystem interface to FUSE operations, with separate inode, open-handle, error-mapping, cache, and mount concerns.

`absfs/fusefs` is a very small and low-adoption project, so it should be treated as design evidence rather than a production dependency.

Sources:

- [go-fuse filesystem package](https://pkg.go.dev/github.com/hanwen/go-fuse/v2/fs)
- [absfs FUSE adapter](https://github.com/absfs/fusefs)

## A directly LLM-generated example

In July 2025, a reviewed and CI-tested commit in TVL's monorepo added read/write FUSE support to a SQLite-backed filesystem. The commit explicitly says it was generated with Claude Code. Its diff added 272 lines to the Zig implementation plus a 182-line semantics document, supporting creation, offset writes, deletion, and truncation.

This is direct evidence that an LLM can implement a useful FUSE adapter quickly when the backing model and semantics are constrained. It is not evidence that the result handles remote failures, GCS/DB commit ordering, concurrent writers, or production sandbox lifecycle.

Source: [Claude Code-generated SQLiteFS commit](https://code.tvl.fyi/commit/users?h=refs%2Fr%2F9562&id=1aa713d364ba29a70f1e325e163a3d7a4587786a)

## Current agent and sandbox filesystems

### Agent FS

`desplega-ai/agent-fs` is especially close to the Dust topology. It provides a SQLite-backed filesystem, HTTP server, object-storage sync, and a Rust FUSE helper. Its remote-mount mode points the FUSE helper directly at an HTTP API so no object-store credentials are present in the sandbox. The repository documents end-to-end testing from a FUSE-enabled container against a remote API over approximately eight operations.

This validates the proposed topology:

```text
sandbox FUSE helper -> remote filesystem HTTP interface -> owned metadata/storage
```

It is a young, low-adoption project, so it is precedent rather than something Dust should adopt without a deep audit.

Source: [Agent FS repository and remote FUSE mount](https://github.com/desplega-ai/agent-fs)

### Cloudflare ArtifactFS

Cloudflare's ArtifactFS is a current Go FUSE driver explicitly designed for agents, sandboxes, and CI. It exposes a Git-backed versioned tree immediately and hydrates blobs on demand; writable changes are tracked in a local overlay. The repository labels the driver beta and includes end-to-end and benchmark tests.

This supports two ideas relevant to Dust:

- sandboxes can operate against a mounted, lazily hydrated logical filesystem;
- a local overlay/commit model is reasonable for agent workloads instead of synchronously persisting every small write to remote object storage.

Source: [Cloudflare ArtifactFS](https://github.com/cloudflare/artifact-fs)

## Mature adapters show where complexity accumulates

### rclone mount

Rclone mounts many cloud backends through a generic VFS. Its documentation says that without VFS cache mode, writes are sequential and many applications do not work. `writes` or `full` cache mode is needed to stage files locally and present more normal filesystem behavior. This matches the proposed Dust design and shows that write staging is an established adapter pattern.

Source: [rclone mount and VFS cache behavior](https://rclone.org/commands/rclone_mount/)

### GCS FUSE and Mountpoint for S3

GCS FUSE historically staged the complete local file and uploaded it on close or fsync; its newer streaming path adds complexity for throughput. AWS Mountpoint deliberately rejects POSIX behaviors that cannot be mapped efficiently to object storage. Both show that production complexity comes from the semantics and performance envelope selected, not from registering FUSE callbacks.

Sources:

- [Cloud Storage FUSE source and write paths](https://github.com/GoogleCloudPlatform/gcsfuse)
- [Mountpoint S3 filesystem semantics](https://github.com/awslabs/mountpoint-s3/blob/main/doc/SEMANTICS.md)

## Recalibrated recommendation for Dust

Do not begin with low-level libfuse or attempt full POSIX behavior. Build the first spike using an existing high-level binding, most plausibly Go `go-fuse` or Python `fsspec.fuse`, against a tiny remote filesystem interface.

The spike should intentionally support only:

- `stat/list/open/read`;
- `create/write/truncate` with local staging;
- `rename/unlink/mkdir/rmdir`;
- one writable sandbox per pod;
- explicit flush before sandbox sleep;
- unsupported operations returning clear errors.

The first question is not whether Codex can generate the adapter; existing code shows that it can. The questions are whether actual Frame and coding workflows fit the restricted semantics, whether syscall latency is acceptable, and whether the chosen content-commit protocol survives retries and sandbox destruction.

If the prototype passes those tests, most of the earlier estimate disappears. If it fails because workloads demand concurrent mounts, mmap, locks, hard links, or cross-client cache coherence, that is evidence for adopting JuiceFS rather than continuing to expand a custom adapter.

## Implementation progress — 2026-08-10

### Milestone 1: reuse boundary selected

The current sandbox image already has the two expensive pieces required for a narrow prototype:

- `/dev/fuse` support and `gcsfuse`, which already handles GCS credentials, listing, transfer, retries, and object-store behavior;
- Python 3 plus a managed Python environment, which gives us a small high-level FUSE implementation path without adding a new compiled service first.

The first prototype will therefore keep `gcsfuse` as a hidden data-plane mount and expose a thin passthrough FUSE mount at the existing user-facing path. The thin layer only owns the missing product semantics: observing create/write/truncate/rename/unlink/mkdir/rmdir operations and recording an ordered mutation journal. This avoids rebuilding a GCS client and gives rename a first-class event instead of inferring it later from an object copy plus delete.

The existing Rust `dsbx` helper is a plausible long-term home for the adapter, but it currently has no FUSE dependency or mount command. Extending it would require a release in another workspace before the Front integration could be exercised. For the spike, a small image-baked Python helper is the shorter reversible path; if the syscall and lifecycle tests pass, moving the same operation contract into `dsbx` is a contained optimization rather than an architecture change.

The initial milestone intentionally stops before DB reconciliation. It will prove that normal sandbox programs can use the existing mount path unchanged while Dust captures enough information to reconcile logical file identity. Durable delivery and idempotent application of those events are the next seam, not something to hide inside the filesystem callback implementation.

### Milestone 2: executable overlay and mount wiring

The spike now includes an image-baked `dust-fs-overlay.py` helper based on the same high-level `fusepy` binding used by the generic fsspec bridge. It forwards normal file operations to a hidden gcsfuse mount and appends versioned JSONL events for `create`, `content_committed`, `rename`, `unlink`, `mkdir`, and `rmdir`. Events have a UUID, per-mount sequence, timestamp, mount identity, and source/destination paths where relevant.

Scope was tightened to the two product mount kinds that matter in a sandbox:

- conversation files (`w/{workspace}/conversations/{conversation}/files`);
- pod files (`w/{workspace}/pods/{pod}/files`).

At most two targets can be mutation-tracked. Pod function bundles and pod-state replicas explicitly remain direct gcsfuse mounts, and user files remain outside the sandbox mount set. The overlay runs as the existing unprivileged `agent` account; its hidden data mount and event journal live under mode-0700 `/run/dust-fs`, so workload code cannot bypass the overlay or edit the journal.

The integration is capability-gated (`dust_fs_overlay`) and preserves the direct-gcsfuse path for older images. The base image installs the small fusepy/libfuse dependency, copies the root-owned helper, and was bumped to `0.8.71`.

Validation so far:

- the helper's local behavioral self-test exercises create, write/close, rename, unlink, mkdir, and rmdir and checks event order and sequencing;
- focused Front tests verify the hidden GCS mount command, unprivileged overlay command, two-target limit, image hardening, and the real pod mount composition;
- 34 focused Vitest tests pass across the sandbox image registry and GCS sandbox mount adapter.

This milestone captures the exact signal missing from GCS today, but it does not yet delete a `FileResource`. The JSONL journal is deliberately not treated as durable product state: the next piece is an acknowledged, idempotent ingestion protocol that resolves a mount-relative path to logical file identity and applies lifecycle changes in Front.

### Milestone 3: lifecycle hardening and handoff boundary

The mount now fails closed. If the overlay cannot start after its hidden gcsfuse mount is ready, Front requests sandbox recreation rather than leaving a normal writable directory at the expected path. On every existing runtime refresh (including wake), Front executes `statfs` through the workload account and verifies the user-visible conversation/pod path is still a live FUSE mount. A missing/dead overlay is logged, rejects readiness, and requests recreation.

Final local validation for the spike:

- Python mutation self-test passes;
- focused TypeScript type-check passes using only the changed dependency graph;
- Biome formatting/lint passes on all changed TypeScript files;
- 35/35 focused Vitest tests pass.

The spike is executable but not production-complete. Before enabling lifecycle reconciliation, it still needs:

1. a real sandbox end-to-end test over `/dev/fuse` and a hidden gcsfuse mount;
2. durable event delivery with acknowledgements and replay-safe cursors before sleep/destroy;
3. an idempotent Front reconciler that updates or deletes an existing logical file resource by `{mount_id, path}` without creating a DB row for every GCS object;
4. an explicit policy for atomic-save rename-overwrite and copy+unlink across the conversation and pod mount boundary;
5. editor/workload benchmarks and a decision on the deliberately unsupported hard-link, symlink-creation, special-node, and xattr operations.

UI/API mutations that bypass the sandbox mount are still application operations and must call the same reconciler directly. FUSE fixes the previously invisible sandbox syscall path; it should not become the only deletion path.

## Mutation delivery precedent check — 2026-08-10

### Short answer

No production precedent reviewed here uses an ephemeral local JSONL file, later polled by an external control plane, as the authoritative successful-mutation path. The common designs are:

- synchronous IPC/HTTP to the service that owns filesystem metadata;
- a durable local metadata database plus staged content, where that local state is itself authoritative and survives restart;
- direct commits to a shared metadata engine/backing store, optionally followed by a durable changelog for secondary consumers.

The current `/run/dust-fs/events/mount-{index}.jsonl` file is therefore a useful executable probe and debugging artifact, not a production delivery design. `fsync` makes each append resilient to a helper-process crash while the sandbox still exists, but `/run` remains scoped to that sandbox runtime and there is no durable receiver acknowledgement, replay cursor, retention protocol, or recovery after sandbox loss.

### What the relevant projects actually do

| Project | Successful mutation path | Relevance to Dust |
| --- | --- | --- |
| Agent FS | The FUSE helper stages file bytes locally, then synchronously sends `OpenWrite` on close; unlink and rename synchronously send typed `Unlink` and `Rename` requests and wait for success. Local mounts use msgpack IPC and remote sandbox mounts invoke the HTTP API directly. Its NDJSON sidecars contain conflicts/errors, not the successful mutation stream. | This is the closest topology: sandbox FUSE callbacks call the owned business API directly rather than leaving a local journal for polling. [FUSE operations](https://github.com/desplega-ai/agent-fs/blob/5900e205bd0b7db3127d31ed583935ae4f34c681/packages/fuse-helper/src/fs.rs#L253-L317), [rename/unlink](https://github.com/desplega-ai/agent-fs/blob/5900e205bd0b7db3127d31ed583935ae4f34c681/packages/fuse-helper/src/fs.rs#L536-L603), [remote HTTP transport](https://github.com/desplega-ai/agent-fs/blob/5900e205bd0b7db3127d31ed583935ae4f34c681/packages/fuse-helper/src/ipc.rs#L947-L1123), [diagnostic sidecars](https://github.com/desplega-ai/agent-fs/blob/5900e205bd0b7db3127d31ed583935ae4f34c681/docs/fuse-mount.md#L78-L102) |
| Cloudflare ArtifactFS | Writes and whiteouts are persisted in an embedded SQLite `overlay_entries` table plus an `upper/` content directory. Rename uses a SQLite transaction. Its poller watches Git refs and reconciles the overlay after Git commits; it does not poll an event file into a separate application database. | This validates a local overlay only when the overlay database and content are the durable filesystem state, which Dust's sandbox-local `/run` is not. [Overlay schema and store](https://github.com/cloudflare/artifact-fs/blob/8b2cc2fb233f3c7f91efa1099fd200e2fa526a4a/internal/overlay/store.go#L25-L66), [delete and rename](https://github.com/cloudflare/artifact-fs/blob/8b2cc2fb233f3c7f91efa1099fd200e2fa526a4a/internal/overlay/store.go#L364-L460), [architecture](https://github.com/cloudflare/artifact-fs/blob/8b2cc2fb233f3c7f91efa1099fd200e2fa526a4a/README.md#L249-L274) |
| JuiceFS | The client commits filesystem metadata to a shared metadata engine and stores blocks in object storage. Optional local writeback stages data for asynchronous upload, but the metadata service is still updated as part of the write path. Its optional external-consumer changelog is stored in the metadata engine; consumers persist a version cursor and deduplicate replay. | If Dust wants asynchronous reconciliation, this is the representative pattern: put the event in durable shared state before treating it as delivered. [Client write cache](https://juicefs.com/docs/community/guide/cache/#client-write-data-cache), [metadata changelog and cursor](https://juicefs.com/docs/community/administration/changelog/) |
| rclone VFS | Dirty data and cache metadata are kept together on disk, uploads are queued directly to the backing store, and startup walks the data/metadata cache to requeue dirty entries. There is no separate control-plane lifecycle consumer. | Local staging is safe only to the extent that the cache directory and its dirty metadata survive restart. [VFS cache behavior](https://rclone.org/commands/rclone_mount/#vfs-file-caching), [cache reload](https://github.com/rclone/rclone/blob/master/vfs/vfscache/cache.go#L538-L563), [dirty-item requeue](https://github.com/rclone/rclone/blob/master/vfs/vfscache/item.go#L852-L887) |
| Syncthing | Filesystem notifications are hints that trigger scans. The durable model is an index database, peers exchange sequenced `IndexUpdate` records, and periodic full scans repair missed notifications. | A scan is a good repair mechanism, but an unacknowledged watcher/event file should not be the only lifecycle record. [Watcher, scans, and index database](https://docs.syncthing.net/users/syncing.html), [sequenced index updates](https://docs.syncthing.net/specs/bep-v1.html#delta-index-exchange) |

FUSE itself does not supply a durable event channel. In write-through mode the kernel sends writes to the userspace filesystem immediately; writeback-cache mode only delays and coalesces dirty pages until background writeback, close, or `fsync`. The userspace filesystem still has to define the authoritative commit and failure semantics. [Linux FUSE I/O modes](https://docs.kernel.org/filesystems/fuse/fuse-io.html)

### Recommendation for the two Dust mounts

Use one narrow, authenticated mutation protocol for exactly the conversation-files mount and the pod-files mount. Each request should carry `mount_kind`, `mount_id`, an idempotency key, the operation and relative path(s). The Front-owned receiver should durably accept or apply the operation before the FUSE callback reports success; expensive follow-up work can run from a durable inbox/outbox after that acknowledgement. Conversation events then invoke the `FileResource` lifecycle policy, while pod events invoke the pod-files policy. No generic mount discovery or per-object database mirroring is needed.

The clean production target is the Agent FS pattern: namespace mutations (`create`, `rename`, `unlink`, `mkdir`, `rmdir`) go through a Front operation that owns both Dust metadata and the backing-store action; content is committed on `flush`/`release` through an idempotent close-time operation. If retaining hidden `gcsfuse` as the data plane during migration, the helper should at least send mutation intent to a durable Front inbox before the backing mutation and mark it committed afterward, so a sandbox crash leaves a remotely recoverable pending record. A post-GCS, best-effort event alone still has an unrecoverable window.

Keep the local JSONL only for the spike's assertions and operator diagnostics. Use a GCS/path reconciliation scan at wake or before destruction as defense in depth, analogous to Syncthing's full scan, not as the normal mutation transport. UI/API deletion and rename paths should call the same idempotent Front operation directly.

## Milestone 4: direct, durable Front mutations — 2026-08-10

The JSONL transport has now been removed from the implementation. For each of the two tracked mounts, the overlay calls an internal Front endpoint synchronously with a short-lived sandbox token scoped to the exact conversation and/or pod. The same idempotency key is retained across HTTP retries, and the token is re-read on every attempt so normal sandbox credential rotation does not interrupt a filesystem operation.

Front persists the request before applying it in `sandbox_file_system_mutations`. A completed request is replay-safe; concurrent duplicates receive a retryable response; failed or abandoned claims can be reclaimed. Namespace operations are owned by Front rather than inferred after gcsfuse has copied or deleted an object:

- `rename`, `unlink`, `mkdir`, and `rmdir` mutate the canonical GCS namespace through `DustFileSystem`;
- file and directory moves update every linked `FileResource` at or below the source path;
- recursive deletes remove every linked `FileResource`, including its canonical original/processed objects, before deleting any remaining GCS subtree;
- `content_committed` copies the flushed mount object back to the stable canonical original of an existing linked `FileResource` and advances its version;
- no database node is created for an ordinary GCS file that has no logical `FileResource`.

The hidden gcsfuse data mount now disables list, metadata, and negative metadata caching for tracked mounts so it observes namespace mutations Front performs through GCS. The helper and its rotating token remain under the root-controlled `/run/dust-fs` boundary, while filesystem callbacks run as the unprivileged `agent` user.

Verification at this checkpoint:

- the direct-HTTP overlay behavioral self-test passes;
- the sandbox adapter and access-token suites pass (20/20);
- the migration was generated and reduced to the one new table rather than including unrelated drift from the developer database.

The remaining gate is operational: build the new sandbox image, start a real conversation-owned sandbox against local Front, and exercise create/write/rename/delete through the mounted path while checking both GCS and `FileResource` state.

## Milestone 5: real sandbox validation and final trust boundary — 2026-08-10

The operational gate now passes on `dust-base:0.8.76` (E2B template `7zxfop19ndkai4au7twv`). Two image defects were found by using a real VM rather than mocks: the first build lacked `fusepy`, and the next needed `user_allow_other` in `/etc/fuse.conf`. After those fixes the user-facing conversation path mounted as `fuse dust-fs-overlay` over the hidden gcsfuse data mount.

The first live write then exposed a more important boundary issue. Running the adapter as `agent` sent its Front callback through the workload's per-owner egress proxy, where it was correctly denied. The final design therefore uses a dedicated system account, `dust-fs`, for the semantic FUSE process. It is neither a workload execution identity nor included in the workload egress redirect. E2B's image-level network policy permits only Front's API hostname in addition to the existing infrastructure allowlist, and every mutation still requires the short-lived JWT scoped to the sandbox and its exact conversation/pod mounts. The hidden mount and token are owned by `dust-fs`; workload users only see the `allow_other` user-facing mount. This separates filesystem control-plane traffic from user-selected internet access without running a path parser as root.

The real E2E created a production-shape local conversation, `FileResource` frame, and E2B sandbox, then exercised the mount through normal shell programs. It verified:

- atomic editor save (`temporary file -> rename-overwrite`) preserved the frame sId and advanced its version from 1 to 2;
- moving the frame into a directory changed its canonical mount path without changing logical identity;
- ordinary files and directories could be created, renamed, unlinked, and removed without creating `FileResource` rows;
- deleting the moved frame removed its `FileResource`, canonical original object, and mount object;
- all 11 `content_committed`, `rename`, `mkdir`, `unlink`, and `rmdir` requests reached `completed` durable state;
- the test conversation and sandbox were destroyed afterward, as was the earlier retained diagnostic VM.

Final verification:

- `dust-base:0.8.76` build-time fuse import and overlay self-test passed;
- the full sandbox pause/wake security regression passed on the built image;
- 65 focused Front tests pass, including dedicated service-account and Front-host trust-boundary assertions;
- 29 focused front-api tests passed for the internal mutation endpoint and recursive canonical deletion;
- the Python self-test, Swagger annotation lint, Biome checks, and `git diff --check` passed;
- the repository-wide type-check still reports pre-existing errors in unrelated dirty-worktree files, with none in the filesystem implementation paths.

The implementation remains deliberately narrower than a general POSIX filesystem: it supports exactly the two conversation/pod mounts and the operations needed by current sandbox/editor workflows. It does not add a database row for every GCS object, and it does not attempt distributed cache coherence, hard links, special nodes, or arbitrary cross-mount renames.

## Cross-mount frame move finding — 2026-08-11

A real pod-associated conversation sandbox was used to run `mv` from its conversation path to its pod path. Both paths were healthy `dust-fs-overlay` mounts, but they were separate FUSE superblocks. Linux therefore could not issue one `rename` callback and coreutils fell back to copy plus unlink:

```text
copied '/files/conversation-…/PipelineDashboard.tsx' -> '/files/pod-…/CrossMountDashboard.tsx'
removed '/files/conversation-…/PipelineDashboard.tsx'
```

The bytes arrived correctly, but logical identity did not:

- the pod `content_committed` operation found no existing `FileResource`, so it left a plain GCS object;
- the following conversation `unlink` deleted the original frame row and its stable original object;
- fetching the original frame sId returned `null`, and neither source nor destination mount path had a linked `FileResource`;
- the observed GCS state was original absent, conversation source absent, pod destination present.

All disposable conversation, sandbox, frame, and pod-destination artifacts were then removed and verified absent.

This cannot be fixed reliably by correlating an independent create and unlink: arbitrary programs may legitimately perform the same pair, retries can reorder them, and content hashes do not establish user intent. To preserve identity for arbitrary sandbox programs, the conversation and pod directories need to appear under one FUSE filesystem instance (most naturally a single `/files` mount that routes to the two hidden gcsfuse backings). The kernel can then deliver cross-scope rename as one operation. The mutation contract must carry source and destination mount identities, and Front can perform one idempotent cross-scope `moveCanonicalFile` while retaining the frame sId, publication metadata, and stable original.
