# dfs:// v2

Replace SlateDB/GCS with a shared FoundationDB cluster and LanceDB with a shared Elasticsearch
cluster. Preserve [v1 filesystem semantics](../v1/DESIGN.md) and
[v1 search semantics](../v1/DESIGN-SEARCH.md), except for the explicit changes below.
Implement locally and benchmark before moving to `dust-dev`. [PLAN.md](PLAN.md) tracks the work.
The local milestone is complete; [gcp/README.md](gcp/README.md) describes the next three-zone FDB
experiment, using manually provisioned private VMs and the unchanged API/client.

## Non-negotiable constraints

**The purpose of FoundationDB is to eliminate the single-writer requirement.** Independent
dfs-server processes MUST be able to mutate the same workspace correctly through FDB transactions.
No exclusive workspace owner or workspace writer lease. Process-local locks coordinate only local
requests; correctness across servers relies on FDB. The server-writeback project permits bounded RAM
acceptance for file edits, with fresh transactional reauthorization and durable file fsync below.

**This optimization phase preserves the exact existing API.** Approved client changes are raising
the live inode cap from 100,000 to 1,000,000 and the xattr filtering/cache described in
[v1's FUSE design](../v1/DESIGN.md#fuse-and-transport). Benchmark these client changes explicitly.
Compound or bulk RPCs and additional client batching are out of scope. Server writeback explicitly
changes file acknowledgment/overwrite semantics without changing gRPC messages or the client.
Preserve live authority, atomic persisted state, namespace preconditions, and deferred errors.
Optimizations must work for deep paths and grants anywhere in the tree; do not rely on workspace-root
shortcuts.

## Compatibility

- Reuse the **v1 protocol, Rust client, CLI, and Linux FUSE client**, with the approved client changes
  above. Keep the `dfs.v1`
  protobuf package, RPCs, messages, errors, authentication, limits, and client cache/writeback behavior.
- Preserve UUIDs/URIs, per-object versions, metadata/MIME/binary xattrs, sparse 64 KiB blocks,
  inherited grants, dual grant indexes, sessions with at most 512 grants, and unlink-to-`ENOENT`.
- Versions are opaque equality tokens in the existing `uint64` field, not numeric increments.
  New objects start at 1; every changed existing object receives a never-reused token. Servers
  durably reserve disjoint ranges of 1,048,576 tokens in FDB and consume them from RAM. This counter
  allocates identities only: it is not a workspace revision, cache invalidation signal, or commit
  order. Crashes can waste reserved tokens. The unchanged client uses equality comparisons.
- Preserve search filters, extraction limits, excerpts, status, bounded candidate expansion, and
  per-search authorization caches. No subscriptions, global permission cache, or replicated grants.
- Changes: `/shared` stops suppressing reachable entries; file edits can acknowledge RAM acceptance;
  ES supplies relevance ranking, so exact LanceDB scores/order are not a compatibility promise.
- Keep v1 intact except for those client changes. Use a fresh v2 FDB subspace and ES index; data migration
  is outside this iteration.

The server-writeback foundation uses FDB format `dfs-v2-fdb-2` to prevent old binaries from mixing
numeric increments with reserved tokens. Use a fresh prefix; existing benchmark data remains intact.

## Architecture and localhost

The local fixture runs one Rust dfs-server serving many workspaces through the existing gRPC API,
with process-local sessions and one background indexer. This is a deployment convenience, not a
single-writer guarantee: independent server instances may access the same workspace. FDB stores all
authoritative metadata, file contents, and indexing obligations; ES stores only derived search
documents. Neither store is created per workspace.

Start with a reproducible local stack: one FDB node configured for single-node durable storage,
one ES node with one primary shard and zero replicas, persistent data volumes, and health checks.
Use Linux containers/VM for a matching FDB server/native client and FUSE on macOS; keep addresses
reachable within that network and expose development services only on localhost. Pin versions and
record architecture/emulation, CPU, RAM, and disk budgets. No GCP credentials are needed locally.

Only dfs-server accesses the stores. Workspace isolation is enforced by server authorization and
mandatory workspace scoping in every key/query; prefixes and ES routing alone are not security
boundaries. The local single-node setup provides no machine-failure redundancy.

Use FDB/ES native caches and the OS page cache; remove SlateDB/LanceDB cache configuration and the
GCS object cache. A dfs-server restart discards sessions and process-local state, but never deletes
database volumes. Backend caches survive independently; benchmark their state explicitly.

## Root and /shared

The synthetic root stays unchanged. `/shared` merges the session's `objects_by_grant` scans in
object-ID order, deduplicates IDs before pagination, and renders `<basename>--<object-id>`.

**Do not exclude a directly granted object because its parent/ancestor is authorized or it is
already visible in the main tree.** A granted folder and its explicitly granted descendants may
both appear. This removes the ancestor-reachability queries, while retaining up to 512 grant scans.
Inherited access alone does not enumerate every descendant into `/shared`.

Exclude the workspace root itself. Preserve the special authorized workspace-root child named
`shared`, which must remain reachable inside synthetic `/shared`. List and lookup MUST agree on
eligibility and current names. A matching explicit grant establishes access without an ancestor walk;
the special entry still requires normal authorization. Visible parents, alias identity, and immutable
synthetic entries retain v1 behavior.

## FoundationDB storage and transactions

Retain v1's logical key families under one configured application prefix followed by workspace:
`objects`, `children`, `grants_by_object`, `objects_by_grant`, `data`, `workspace`, and the search
pending/status/backfill keys. Reuse unambiguous component encoding and ordered block suffixes.
There is no workspace coherence revision. A separate application-wide counter reserves token ranges;
it does not advance for every mutation or invalidate caches.

FDB limits values to 100,000 bytes and transactions to 10,000,000 affected bytes, with a roughly
five-second transaction lifetime. The existing 65,536-byte content blocks fit. Metadata encoding
MUST support every v1-valid xattr payload. Keep compact Postcard records: at most three times the
32 KiB xattr budget plus 1 KiB for other fields fits one FDB value. No overflow records are needed. Keep 1 MiB RPC writes and account for keys and
conflict ranges in the transaction budget. Never split an atomic filesystem mutation across commits
or lower public limits to hide a storage-format problem. See [FDB limits](https://apple.github.io/foundationdb/known-limitations.html).

Each durable publication runs authorization, applicable namespace/version checks, block patches,
related index updates, and pending-search changes in **one serializable FDB transaction**. Buffered
file edits reapply semantic operations to current records, permitting concurrent overwrites. Authorization and
precondition reads MUST participate in conflict detection, including ancestor/grant reads. Retain
session-close/publication coordination within the server. Recheck active sessions on synchronous retries; accepted queued edits retain their original grants
through session expiry and recheck live file authorization at persistence.
FDB reads use one transaction read version; accepting-server filesystem reads also apply local
pending edits under the publication gate.

Retry only attempts known not to have committed, within a bounded deadline, using the original
client-supplied expected versions for strict operations. Buffered file operations instead reapply
to current state. A retried transaction MUST reauthorize and revalidate; read/namespace version
mismatches remain client-visible conflicts. Ambiguous commit outcomes return the existing
error without automatic replay or retry receipts. Only advisory ancestry hints and never-reused token reservations may escape transaction retries;
keep other external side effects outside them.
See [FDB transaction errors](https://apple.github.io/foundationdb/developer-guide.html#the-commit-unknown-result-error).

Shrink trims the surviving tail and range-clears later blocks; unlink range-clears content and removes
metadata, entries, and both grant directions atomically. Reverse-grant cleanup still needs bounded
enumeration. Preserve zero-fill after re-extension and existing capacity errors for oversized edits.

### Server writeback

Positioned file writes and file updates (size, times, mode, MIME, xattrs) acknowledge bounded RAM
acceptance. Their expected mutation versions are advisory: concurrent writes may overwrite overlapping
bytes/fields in commit order. Preserve unspecified fields and bytes. Create/mkdir, rename/remove,
grants, directory updates, and append remain synchronous and keep strict expected-version checks.
The unchanged client's directory fsync sends no RPC, so namespace operations remain durable.

Retain ordered semantic operations per file, with acceptance timestamps and originating grants.
Local stat/lookup/list/read include pending edits after fresh authorization. Other servers see only
committed FDB state. No whole-file buffer, local recovery log, global permission cache, or exclusive
workspace owner. A crash may lose unflushed acknowledgments; reopening starts from committed FDB.

Defaults: 256 MiB conservative queue accounting, 16,384 dirty files, 32,768 session/file receipts,
64 operations per file, 50 ms debounce, 500 ms maximum dirty age, 4 MiB / 64-file batches, and eight
workers across workspaces. Memory, delays, batch limits, and concurrency are configurable through
`DFS_WRITEBACK_*`; zero `DFS_WRITEBACK_MIB` retains the previous strict synchronous mode. Thresholds
trigger pressure flushing before accepting more work. FDB's own transaction-size/deadline checks
remain final guards. Dirty-age limits schedule flushing; they do not bound backend outage duration.

Acceptance and local reads take the existing workspace read gate; publication takes its fair write
gate through queue removal. This initial implementation batches files within a workspace and runs
independent workspaces concurrently. Independent servers still commit concurrently through FDB.
Replay operations against fresh FDB state, reauthorize each originating grant set, and publish
blocks/metadata/search work atomically. Preserve the acknowledged token if its base is unchanged;
a rebase receives a distinct token. Unlink never recreates records.

File fsync takes the publication gate, freezing a finite prefix including earlier in-flight work,
flushes that file's pending operations, reports sticky session/file errors, and rechecks authority.
Later writes cannot extend this barrier. Successful fsync includes normal FDB log durability;
ordinary close remains cheap. Session close and graceful shutdown drain accepted work. A failed or
ambiguous batch cannot silently disappear: retain its errors until session closure/expiry. Only
known-uncommitted FDB attempts may retry; ambiguous outcomes never replay automatically. An
uncommitted application failure can split a multi-file batch to isolate unrelated files.

Search indexes committed FDB only. Suppress locally dirty search candidates and include RAM files
in index-status pending counts, deduplicated against FDB work. Fsync never waits for ES.
See [FDB commit path](https://github.com/apple/foundationdb/wiki/Transaction-Commit-Path).

### Ancestry read hints

Filesystem reads retain workspace-scoped object-to-parent and `(parent, name)`-to-object ID hints,
sharing a bound of 16,384 entries and an 8 MiB accounting budget per server. Object/child reads and
successful creates/moves populate them, including newly extracted files and directories. They contain
no grants, authorization decisions, or authoritative metadata.

Hints schedule live object/grant reads for up to 16 nodes concurrently in the current transaction.
Follow only the parent chain verified by those live records; discard off-chain results/errors and
fall back to the actual parent after a move or cache miss. All used reads retain FDB conflict tracking.
Stale hints and hints learned during aborted attempts are harmless: moves and grant changes require
no invalidation or expiry delay. The same algorithm applies at every depth. Search keeps its existing
per-request cache; the client and API are unchanged.

A name hint schedules the child record alongside its live name-index lookup. Consume that record
only if the current index still names the hinted ID and the record's parent/name match. Missing or
changed entries discard the speculative result, including errors; no invalidation messages are needed.

### Transaction read scheduling

Every transaction attempt obtains its read version normally from FDB, including mutations, read-only
APIs, and search. Do not cache or reuse commit versions. Conflicts/expiry retry with a fresh transaction;
ambiguous commits never replay. All dependency reads retain conflict tracking.

Client and server latency settings use native FDB defaults in local and networked deployments.
The networked benchmark did not reproduce the large localhost tuning benefit. Nondefault settings
require an explicit experiment; retain normal log durability and conflict resolution and validate
filesystem latency and independent writers. See [settings](README.md).

Filesystem requests start workspace, primary object, hinted ancestor/grant reads, and optional
child-name lookup concurrently. Retain at most 16 object/grant results and one child entry/object, only
within the current transaction. Create checks its candidate UUID alongside this entire first wave.
Consume results/errors in the original validation order and use only the verified live parent chain;
speculative reads cannot expose hidden objects or authorize through a stale parent hint.

Content reads prefetch at most the first requested block alongside the same metadata/authorization
wave. Consume its bytes or error only after live authorization, type/version checks, and size establish
that the block is needed; empty/beyond-EOF reads ignore it. Additional blocks remain bounded and parallel.

Block patches read up to 16 blocks concurrently. Skip the old-block read only when live object size
proves the block is beyond EOF or the patch replaces every existing logical byte in it. Other bytes
are preserved and holes remain zero-filled. The object read stays conflict-tracked, including when
the block read is omitted. Distinct state tokens, pending search work, and commit boundaries stay intact.

## Shared Elasticsearch index

Use one application index with explicit mappings and one live document per file. Document identity
encodes `(workspace_id, object_id)` unambiguously. Require workspace routing on writes, reads, deletes,
and searches, plus an explicit workspace filter on **every search**. Routing selects shards and does
not filter their other workspaces. See [ES routing](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/mapping-routing-field).

Store v1's indexed metadata, object version, extracted text, excerpt, and extraction status. Use BM25
with v1 Unicode alphanumeric token boundaries, its 40-byte exclusion limit, lowercase/ASCII folding,
OR semantics, and no stemming or stop-word removal. Preserve exact
metadata predicates and timestamp precision. Test analyzer behavior for code and Unicode; backend
ranking may differ. Dynamic per-xattr fields are forbidden.

Represent xattr existence as keyword keys and equality as SHA-256 of the unambiguous `(key, bytes)`
encoding. Verify matching xattr predicates against authoritative metadata before returning hits.
Fixed-size equality terms support all valid binary values without Lucene's 32,766-byte term limit
or silently unindexed values. See [ES term limits](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/ignore-above).

## Background indexing

Preserve atomic coalescing pending jobs, token-checked completion, bounded fair workspace scans,
resumable backfills, extraction skips, and retry status from v1. FDB source mutations are already
durable; remove the SlateDB durability wait. Finish backfill before consuming that workspace's queue.

Read bounded file chunks in short transactions, checking the same object version and pending token
in each. Discard extraction if either changes; never mix versions or retain an FDB transaction across
ES requests. Keep eight concurrent extractions and batches bounded by both document count and
serialized bytes. An individual supported 8 MiB text file must still fit a bulk request.

One ordered worker submits full-document replacements in bulk and inspects **every item result**.
Use ES per-document sequence/primary-term conditions (create-if-absent initially); capture that
condition before reading the authoritative source. After a conflict, reload the pending job and
source instead of replaying an old body. Keep minimal nonsearchable deletion tombstones so late
requests cannot resurrect removed documents. These are internal ES conditions, not filesystem
versions. See [ES concurrency control](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/optimistic-concurrency-control).

Clear a job/update status in FDB only after its ES operation succeeds and its pending token still
matches. Use bulk `refresh=wait_for` so completed jobs are search-visible; never force a refresh per
file. Failed/ambiguous items stay pending and replay safely. Source data remains usable while ES is
unavailable. See [ES refresh](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/refresh-parameter).

## Search authorization

Search first, then filter through current FDB grants, as in v1. Never materialize grants in ES.
Use an ES point-in-time view and internal `search_after` for bounded candidate expansion; close the
PIT afterward. Every hit MUST exist, match its indexed object version, and pass authorization before
any ID, metadata, or excerpt is returned. Retain the existing result/candidate/time limits and session
recheck. See [ES pagination](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/paginate-search-results).

Permission memoization remains bounded and local to one search and FDB read version. Open the FDB
view only when candidates need validation. If it expires during expansion, discard accumulated hits
and permission decisions and revalidate retained candidates in a fresh view within the request
deadline. Never combine authorization from different snapshots in one response. Budget exhaustion
returns only validated partial results; backend failures are errors, never successful empty results.

## Evaluation and later work

First run the existing filesystem/search tests and unchanged Linux FUSE client against local v2.
Then run jd's unchanged filesystem corpus/workloads and the 10,000-file search benchmark, including
multiple workspaces, selective grants, and 512-grant sessions. Keep v1 results intact.

Measure foreground operations, client writeback, FDB commit latency/retries, indexing lag/drain,
ES refresh, authorization, resource use, and disk footprint. There is no post-acknowledgement SlateDB
persistence drain. Distinguish server-only restarts from backend/OS cold tests; local FDB/ES numbers
are not equivalent to v1's cold GCS measurements.

Only after the localhost setup is correct and benchmarked: `dust-dev` deployment, replicated cluster
sizing, private networking/authentication, backups, and comparative cloud runs. Multi-server deployment,
shared session routing, indexer scheduling, automated index replacement/tombstone cleanup, and
large-workspace shard balancing are later work; correctness across independent filesystem writers
is required now. No other v1 feature changes are part of v2.
