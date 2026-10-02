# dfs:// v1 search proposal

Keyword search over files, filtered by metadata, MIME type, and xattrs. Seconds-to-minutes indexing
lag is acceptable. SlateDB remains authoritative; LanceDB is a rebuildable derived index. This
extends [DESIGN.md](DESIGN.md); filesystem writes and fsync retain their existing guarantees.

## Architecture

- **dfs-server:** Owns SlateDB, records pending indexing work, and serves search over existing gRPC.
  It embeds the LanceDB OSS Rust reader and checks session grants against live SlateDB state.
- **dfs-indexer:** One separate trusted Rust process per shard, consuming work over gRPC. It extracts
  text and batches LanceDB upserts/deletes. Only dfs-server writes SlateDB; only the indexer writes
  LanceDB. Initially require one active indexer, without overlapping replacement processes.
- **Storage:** One LanceDB table per workspace in a separate GCS prefix, opened lazily with bounded
  shared caches and table handles. No client access to tables or GCS credentials. LanceDB supports
  [object-store storage](https://docs.lancedb.com/storage); no external search cluster is required.
- Set the search reader's [read consistency interval](https://docs.rs/lancedb/latest/lancedb/connection/struct.ConnectBuilder.html#method.read_consistency_interval)
  explicitly, initially five seconds, so it observes commits from the indexer process.

## gRPC surface

Proposed RPCs; credentials remain in authorization metadata. Search derives its workspace and
at-most-512 grants exclusively from the session, never from request fields.

| RPC | Authority | Request → response |
| --- | --- | --- |
| `SearchFiles` | Session | `query, filter, limit` → `hits[], partial` |
| `GetIndexStatus` | Workspace key | `workspace_id` → pending/failed/skipped counts, oldest pending age, last successful commit time |
| `ReindexFiles` | Workspace key | `workspace_id, optional object_id` → background scan job ID |
| `StreamIndexWork` | Server key; internal | bounded batch request → server stream of job headers, content chunks, and completion markers |
| `AckIndexWork` | Server key; internal | job tokens plus outcomes → acknowledged/superseded results |

Only `SearchFiles` is used by filesystem clients. Stream/ack coordinate the separate indexer while
keeping SlateDB writes in dfs-server. Status/reindex are optional operator helpers, not prerequisites
for search; initial backfill can run automatically and progress can initially use logs/metrics.

- `query` is plain text, not SQL: case-insensitive token search ranked by BM25, initially matching
  any query token. Empty query performs metadata-only search. No regex, vectors, or query DSL.
- `filter` is a bounded typed message: name equality/prefix, MIME-type set, size/time ranges, and
  xattr predicates (`EXISTS`, byte-exact `EQ`). Predicates combine with AND; values within a set use
  OR. Compile expressions with typed literals, not interpolated user SQL.
- Each hit contains `object_id`, stable `dfs://<id>` URI, current `Object` metadata, basename, and a
  bounded excerpt; no canonical ancestor path. Scores stay internal initially.
- `limit` defaults to 20, maximum 100. Start with top-k only, without pagination or total counts.
  `partial` means the candidate/time budget prevented filling the requested result window; it does
  not describe indexing freshness. Unavailable indexes return an error, not a successful empty list.

## Index representation

One row per file: `object_id`, `object_version`, `name`, `mime_type`, `size`, timestamps, mode,
extracted `text`, and extraction status. Directory contents and inherited metadata are not indexed.
Start with UTF-8 text, Markdown, code, and JSON. Cap extracted text at 8 MiB per file; unsupported or
oversized content remains metadata-searchable and explicitly marked skipped, never silently truncated.
Read file blocks in bounded chunks; do not buffer an arbitrary-sized file.

Use native [FTS/BM25](https://docs.lancedb.com/search/full-text-search) on text, B-tree indexes on
object ID and selected range fields, and a bitmap index on MIME type. Disable stemming and stop-word
removal initially for code/document terms. Token search is not substring search.

Keep arbitrary xattrs as two string lists: encoded keys and encoded `(key, value)` pairs. Use a
canonical, length-delimited binary encoding followed by base64, preserving empty and binary values.
`LabelList` indexes support existence/equality without creating a column for every xattr name.
Typed numeric xattr ranges can follow later. LanceDB supports
[scalar and list indexes](https://docs.lancedb.com/indexing/scalar-index) alongside FTS.

## Grants: search, then authorize

**Decision:** Assume keyword and metadata searches are selective. LanceDB finds candidates using
FTS and metadata/MIME/xattr prefilters; dfs-server applies grants afterward. Store no grants in
LanceDB and do not fan out ancestor grant changes or moves into descendant index updates. Existing
SlateDB grant indexes and inheritance remain the only authorization model.

Every returned hit MUST pass current session authorization against one SlateDB snapshot. Require
the file to exist and its indexed object version to match that snapshot before exposing any excerpt
or metadata. Recheck the session before returning; inaccessible/deleted/stale candidates disappear
without details. Grant changes apply to current authorization even while indexing is behind.

Progressively enlarge the ranked candidate window within a pinned LanceDB table version, memoizing
ancestor authorization within the request's SlateDB snapshot. Never just filter the first `limit`
candidates and claim completion. Bound candidate evaluation and request time; return `partial` on
exhaustion. Broad or metadata-only queries can violate the selectivity assumption, so measure
candidate rejection and latency. The stream and schema need no replicated-grant maintenance.

## Pending work and publication

Add workspace-prefixed SlateDB keys:

| Key | Value |
| --- | --- |
| `(workspace, search_pending, object_id)` | random job token, upsert/delete, object version, enqueue time, retry state |
| `(workspace, search_status, object_id)` | last indexed version or explicit extraction failure/skip |
| `(workspace, search_scan, job_id)` | resumable backfill cursor |

1. Every file mutation atomically replaces its pending row in the existing filesystem `WriteBatch`.
   This includes rename, xattrs, MIME, direct grants, truncate, and unlink/replacement tombstones.
   Repeated writes coalesce to the latest state; there is no application WAL or global object version.
   Directory grants/moves need no descendant work because authorization uses live ancestry.
2. The server captures a bounded batch from one SlateDB snapshot, waits **in the background** until
   SlateDB's durable sequence reaches that snapshot's sequence, then streams that exact snapshot's
   metadata and content. This prevents LanceDB from persisting a state that filesystem recovery can
   lose. Never substitute newer live blocks during export. Limit snapshot lifetime and in-flight
   bytes; timeout/disconnect leaves work pending. The internal durability sequence is not a workspace
   revision and does not participate in file conflicts.
3. Stream each job as a header, bounded content chunks, and an end marker; delete jobs need no content.
   The indexer commits only complete jobs, coalesces batches, and preserves per-object commit order.
   Use idempotent [merge/upsert](https://docs.rs/lancedb/latest/lancedb/table/merge/struct.MergeInsertBuilder.html)
   on unique object IDs and repeatable deletes. No concurrent jobs for the same file.
4. Acknowledge only after LanceDB commits. Under the same mutation synchronization, dfs-server clears
   pending work and updates status only if the token still matches. An older completion MUST NOT
   erase a newer mutation. Crashes after commit but before acknowledgement replay harmlessly.
   Transient failures back off without blocking other files; permanent extraction failures stay visible.

The stream is an at-least-once work queue, not a history of every intermediate write. Reconnect scans
pending keys again; use bounded fair scans across workspaces and files. `ReindexFiles` enqueues a file
or a resumable workspace scan. Initial installation backfills existing files; a full rebuild starts
from an empty LanceDB table, scans all current files, and replays pending work. All scan/ack bookkeeping
goes through the owner.

## Maintenance and evaluation

The indexer owns periodic index updates, compaction, and safe old-version cleanup. Native FTS can
scan unindexed fragments; schedule `optimize` to bound that cost and leave `fast_search` disabled so
committed rows are not deliberately skipped. Pin and test the selected OSS Rust release, including
newly introduced terms after insert/update. See the [FTS maintenance behavior](https://docs.lancedb.com/search/full-text-search#keeping-the-index-up-to-date).

Measure p50/p95 search latency and candidate rejection for selective and broad queries, with up to
512 session grants. Verify ancestor grant changes cause no descendant indexing. Include cold GCS
tables, many idle workspaces, xattr selectivity, write coalescing, index lag, and GCS write amplification.
Verify restart between every publication/ack step, edits during extraction, unlink, revocation, and
cross-workspace isolation. Promote publication and authorization rules into code contracts when implementing.
