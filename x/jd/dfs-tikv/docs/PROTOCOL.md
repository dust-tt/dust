# Filesystem wire protocol

[Current clean benchmark](../../dfs-bench/docs/RESULTS.md). Previous benchmark runs and timing reports were removed at the user’s request.

## Whole-filesystem freshness rework

Demand validation is shared across operations and must cover selected file generations as well as names and attributes. The appended ReadBlocks/Blocks messages implement bounded authorized content batches. Existing Head/Changes/Snapshot messages support metadata validation; ordinary read and write opens reuse session/view pins. Watch remains absent. Any wire change requires explicit compatibility evidence. See [the active contract](CONSISTENCY.md) and [acceptance gates](ACCEPTANCE.md).

## Evolution and retry identity

DDIA chapter 4's compatibility question is concrete here: stable request tags and identities let different frontends interpret retries consistently, but removing a service method requires a compatible replacement client. Preserving the remaining frames does not mean old Watch-dependent mounts retain their coherence behavior.

Chapters 8 and 9 also apply: reconnecting transport does not reveal whether a mutation committed. The same logical request identity and payload must survive routing/retry so shared outcomes can resolve it. See [operation sequences](MOUNT_OPERATIONS.md), [consistency](CONSISTENCY.md) and [decisions D06–D07](DECISIONS.md).

The one-second demand-refresh model removes `Dfs.Watch`. The frontend and router no longer expose that RPC. `Dfs.Call` and `Dfs.Snapshot` retain their frame formats, serialized model tags, and request identities.

[compatibility.json](../proto/compatibility.json) records the current protocol/model/client fingerprints. It no longer means that the complete service definition equals the earlier shared mount's service: Watch removal is intentional and requires deployment with the replacement mount.

The remaining use of Tokio watch channels inside services is process-local shutdown coordination, not filesystem change delivery to clients.

The rework extends `view:<node-id>` pins to conditional writes. A pin is session-bound lifetime evidence, not a grant: the frontend validates the authenticated session, current WRITE permission and expected file version for each mutation. Older frontends reject these writable pins, so deploy compatible frontends before switching mounts. Existing explicit Open/Close clients remain supported. Source fingerprints record the updated client timeout/cache code without changing Call/Snapshot enum tags or frame formats.

The content-hash extension preserves existing tags and appends ReadBlocks and Blocks. New mounts require updated frontends; older mounts may continue using Read/ReadPack. [Bounds, authorization and rollout](CONTENT_HASH_CACHE.md#bounded-miss-protocol).

## Buffered file publication extension

`Mutation::PutFiles` is appended after the existing mutation variants; earlier discriminants and Call/Snapshot frame formats remain unchanged. It carries up to 64 full-file updates with one MiB of combined payload. Each update contains a stable client-generated node identity and generation, final attributes/body, and either original revision/entry identity for replacement or an absence precondition for creation. Servers validate the whole group atomically and retain one exact retry outcome, while journal/index positions remain per file.

New default mounts require frontends supporting this variant, so frontend binaries are deployed before mounts. Older mutation variants remain accepted. A local buffered return is not a publication receipt; the receipt is recorded only after the exact batch commits. The [buffer design](../../dfs-bench/docs/WRITE_PATH_REWORK.md) defines deferred errors and synchronization boundaries.
