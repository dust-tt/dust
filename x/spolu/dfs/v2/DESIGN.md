# dfs:// v2

Replace SlateDB/GCS with a shared FoundationDB cluster and LanceDB with a shared Elasticsearch
cluster. Preserve [v1 filesystem semantics](../v1/DESIGN.md) and
[v1 search semantics](../v1/DESIGN-SEARCH.md), except for the explicit changes below.
Implement locally and benchmark before moving to `dust-dev`. [PLAN.md](PLAN.md) tracks the work.

## Compatibility

- Reuse the **unchanged v1 protocol, Rust client, CLI, and Linux FUSE client**. Keep the `dfs.v1`
  protobuf package, RPCs, messages, errors, authentication, limits, and client cache/writeback behavior.
- Preserve UUIDs/URIs, per-object versions, metadata/MIME/binary xattrs, sparse 64 KiB blocks,
  inherited grants, dual grant indexes, sessions with at most 512 grants, and unlink-to-`ENOENT`.
- Preserve search filters, extraction limits, excerpts, status, bounded candidate expansion, and
  per-search authorization caches. No subscriptions, global permission cache, or replicated grants.
- Changes: `/shared` stops suppressing reachable entries; successful mutations await FDB commit;
  ES supplies relevance ranking, so exact LanceDB scores/order are not a compatibility promise.
- Keep v1 intact. Use a fresh v2 FDB subspace and ES index; data migration is outside this iteration.

## Architecture and localhost

One Rust dfs-server serves many workspaces through the existing gRPC API. It owns process-local
sessions and one background indexer. FDB stores all authoritative metadata, file contents, and
indexing obligations; ES stores only derived search documents. Neither store is created per workspace.

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
There is no global or workspace object-version counter.

FDB limits values to 100,000 bytes and transactions to 10,000,000 affected bytes, with a roughly
five-second transaction lifetime. The existing 65,536-byte content blocks fit. Metadata encoding
MUST support every v1-valid xattr payload; oversized encoded records use bounded overflow parts,
read/written atomically with their object record. Keep 1 MiB RPC writes and account for keys and
conflict ranges in the transaction budget. Never split an atomic filesystem mutation across commits
or lower public limits to hide a storage-format problem. See [FDB limits](https://apple.github.io/foundationdb/known-limitations.html).

Each mutation runs authorization, expected-version/namespace checks, block patches, related index
updates, and pending-search changes in **one serializable FDB transaction**. Authorization and
precondition reads MUST participate in conflict detection, including ancestor/grant reads. Retain
session-close/publication coordination within the server. Recheck session activity on each retry.
Reads return related metadata/content from one transaction read version.

Retry only attempts known not to have committed, within a bounded deadline, using the original
client-supplied expected versions. A retried transaction MUST reauthorize and revalidate; an object
version mismatch is still a client-visible conflict. Ambiguous commit outcomes return the existing
error without automatic replay or retry receipts. Keep side effects outside transaction retries.
See [FDB transaction errors](https://apple.github.io/foundationdb/developer-guide.html#the-commit-unknown-result-error).

Shrink trims the surviving tail and range-clears later blocks; unlink range-clears content and removes
metadata, entries, and both grant directions atomically. Reverse-grant cleanup still needs bounded
enumeration. Preserve zero-fill after re-extension and existing capacity errors for oversized edits.

Await normal FDB commit before acknowledging mutations, including workspace creation. This provides
stronger durability than v1's minimum server-visibility guarantee: FDB acknowledges after its log
durability boundary. `fsync` still drains client writeback and checks access; successful write RPCs
have already committed. No application WAL, deferred FDB writes, or server staging cache.
See [FDB commit path](https://github.com/apple/foundationdb/wiki/Transaction-Commit-Path).

## Shared Elasticsearch index

Use one application index with explicit mappings and one live document per file. Document identity
encodes `(workspace_id, object_id)` unambiguously. Require workspace routing on writes, reads, deletes,
and searches, plus an explicit workspace filter on **every search**. Routing selects shards and does
not filter their other workspaces. See [ES routing](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/mapping-routing-field).

Store v1's indexed metadata, object version, extracted text, excerpt, and extraction status. Use BM25
with lowercase token matching, OR semantics, and no stemming or stop-word removal. Preserve exact
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
sizing, private networking/authentication, backups, and comparative cloud runs. Multiple dfs-server
processes/indexer ownership, shared sessions, automated index replacement/tombstone cleanup, and
large-workspace shard balancing are later work. No other v1 feature changes are part of v2.
