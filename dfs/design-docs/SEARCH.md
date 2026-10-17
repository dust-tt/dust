# dfs:// search proposal

## Tl;Dr

- Optimize for available, fast search. Maximum indexing lag is 30 minutes, including imports and
  large fan-outs. Compute accessible roots from FDB before querying ES. Monitor indexing lag.
- Put tenant, ancestors, and metadata filters in Elasticsearch.
- Enable tenant routing from the first indexed document. Choose the initial shard count from tenant
  and file-type statistics; a large initial shard count is an option.
- Stream search results from the first release. Target p95 of 350 ms to the first useful result batch,
  including authorization and any enabled rescoring.
- Use one Elasticsearch document per object. Aggregate the file's content into its `text` field
  and store metadata, `root_id`, and `ancestor_ids` alongside it.
- Store a durable indexing work queue in FDB. Enqueue work in the same transaction as the source
  changes. Workers consume the queue and handle block reads, descendant fan-out, retries, and
  Elasticsearch backpressure.
- If an object already has pending work, bump its event's offset. Workers fetch current data from FDB.
- Extract text from PDFs, DOCX, PPTX, and other binary formats through MIME-configured webhooks.
  Store extraction output privately in DFS and index its text under the original object's ES ID.


## Availability and freshness

| Concern | Proposed behavior |
| --- | --- |
| Search latency | p95 of 350 ms and p99 below 500 ms to the first useful result batch under concurrent ingestion. Measure completion of a 20-hit stream separately. |
| Result delivery | Server streaming from the first release, with bounded batches, backpressure, cancellation, and a final completion status. |
| Indexing | Source commit to searchable result within seconds. |
| Elasticsearch outage | Filesystem writes continue through FDB and indexing accumulates |
| Worker outage | Serve the existing index; resume from durable work. |
| Excessive backlog | Keep serving old results and alert on freshness |

## System design

```mermaid
flowchart LR
    C[Client] <--> S[DFS server]
    S <-->|Atomic source mutation and queue record| F[(FoundationDB)]
    F <-->|Lease, compacted work, source reads, acknowledgements| W[DFS worker]
    W <-->|Bounded bulk requests and item results| E[(Elasticsearch)]
```

We will use something similar to outbox events, meaning when we update an object (Attr or Blocks), we will at the same insert a record in one or more indexes in the same transaction, representing a durable queue, to notify the search worker of. 

The durable queue is read by the DFS worker, which will update ElasticSearch.
See ## Durable Queue for more details.


## Fanout read vs fanout write

Fanout read requires streaming potentially many results the user cannot access, checking their
permissions, and maintaining an in-memory map of resolved access. Fanout write avoids that work
by denormalizing effective read subjects from the whole ancestor chain onto every ES document.
Changing an ancestor's grants (or moving it) then requires rewriting its descendants, and that can be extremely costly for an index under load.

We use a middle ground. Before touching ES, the server computes the subject's accessible `root_ids`
from FDB using their direct read grants. These are the highest accessible parents
through which they can read a subtree. ES filters its scalar `root_id` against that set, alongside
`ancestor_ids` for recursive scope, avoiding a fanout read over candidate results.

Grant revocations change the roots used by subsequent searches directly in FDB; they do not wait
for ES to index updated subjects. All indexing work uses the same durable queue, including moves
and `DENY` changes. Those operations still require ES updates to roots and ancestry. Current
permission checks before returning results cover stale indexed documents while workers catch up.
The root lookup could use server-side caching, with invalidation on changes to grants, group
membership, or hierarchy that affect accessible roots.

The indexed `root_id` field contains a single ID: the highest accessible parent.
A read `DENY` blocks inherited access.

For example:

```text
foo              ALLOW g:engineering read
└── bar          DENY read
    └── reports  ALLOW g:finance read
        └── budget.pdf
```

The ES document for `budget.pdf` stores:

```text
root_id = reports_id
ancestor_ids = [foo_id, bar_id, reports_id]
```

For a finance member, FDB returns `reports_id`, the highest accessible parent of `budget.pdf`.
ES matches `root_id = reports_id` and can return the file. `bar` is denied, so it is not the
accessible root. Engineering's grant on `foo` is blocked by `bar`; `foo_id` does not match
the file's `root_id`.

Ordinary user/group grant changes update FDB grant records and their forward index without
rewriting descendants in ES. Large permission or hierarchy updates remain necessary for moves
and read `DENY` changes, including insertion or removal.

`ancestor_ids` retains the full ancestor chain, including ancestors above a `DENY`, for folder
scope. Folder search is always recursive. Access and scope filters remain separate: a finance
member searching under `foo` can find `budget.pdf` because `ancestor_ids` contains `foo_id` and
`root_id` equals their accessible `reports_id`.

While it's theorically possible to have more than 65k accessible roots, it seems very unrealistic.
You would need a lot of folders and and lot of directories and a lot of DENY for that.


## Elasticsearch documents

Each indexed object has one document, identified by `(tenant_id, object_id)`. For files with
indexable content, concatenate their stored FDB blocks in file order into `text`. For binary files,
use the current extracted-text object when available. Directories and files without available
indexable content have metadata-only documents. Extracted-text objects do not get their own ES documents.

### Fields

Use explicit mappings with dynamic mapping disabled. All documents carry:

| Field | Representation / use |
| --- | --- |
| `tenant_id`, `object_id` | Exact keywords. |
| `name` | Analyzed text plus exact keyword |
| `kind`, `mime_type` | Keywords. Normalize MIME type/subtype e.g. `Text/Plain; charset=UTF-8` becomes `text/plain` |
| `ancestor_ids` | Keyword array of strict ancestors. Used for recursive folder scope. |
| `root_id` | Single keyword identifying the highest accessible parent. |
| `size` | `unsigned_long`, matching the protocol's byte count. |
| `atime`, `mtime`, `ctime`, `created` | Optional `unsigned_long` millisecond values |
| `xattrs` | One `keyword` array containing escaped key/value pairs for UTF-8 values and key-existence tokens. |
| `text` | Analyzed text containing the aggregated file content; empty for metadata-only objects. |
| `schema_version` | Rebuild compatibility. |

### Xattr

`K` is the key with backslashes and `=` escaped. `V` is the UTF-8 value. Binary values are excluded
from equality search; key-existence search still covers every xattr.

| Token | Purpose |
| --- | --- |
| `k:<K>` | Key existence. Emit for every entry. |
| `v:<K>=<V>` | Equality on the indexed UTF-8 value, truncated when necessary. An empty value produces `v:<K>=`. |

Truncate `V` at a UTF-8 character boundary so the complete `v:<K>=<V>` token fits within 32,766 bytes.
See [keyword limits](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/keyword).

Apply the same encoding and truncation to query values. Values with the same retained prefix match
even if their discarded suffixes differ. No hash fallback or post-search equality verification.
FDB retains the full original value; `Stat` with `include_metadata=true` retrieves it.


### Grants and write fan-out

Read grants and their forward index stay in FDB. Search resolves accessible roots from the
user's and groups' read grants, then filters ES on `root_id`. Write-only grants do not grant
search visibility. Moves and read `DENY` changes require updating affected indexed roots or ancestry.

| Change | Projection work |
| --- | --- |
| File bytes, attributes, or xattrs | Rewrite the file's document with current content and metadata. For binary content changes, request extraction and clear text from an obsolete extraction. |
| Extracted-text publication | Rebuild the original object's document using its metadata and the extraction's text. |
| User/group read grant change | Update FDB grants and their forward index; invalidate cached accessible roots. No descendant ES rewrites. |
| File move | Recompute `root_id` and `ancestor_ids`; rewrite its document. |
| Read `DENY` insertion or removal | Recompute affected `root_id` values on the object and its descendants. |
| Directory move | Recompute `root_id` and `ancestor_ids` throughout the moved subtree. |
| Directory rename | Rewrite its own name; descendants need no path rewrite because paths are not indexed. |
| Directory ordinary metadata | Rewrite the directory only, unless the changed field is explicitly inherited. |
| Original object removal / replacement | Tombstone the removed object's document; enqueue parent metadata and replacement object changes separately. |
| Current extracted-text removal | Clear its target pointer and reindex the original without extracted text. |

For changes requiring descendant updates, the originating transaction inserts one resumable
subtree job; it does not enumerate descendants.
Workers walk `child/<parent>/<name>` in bounded FDB transactions with durable traversal state. Each
batch commits discovered object obligations and traversal progress together. Repeated changes on
the same root coalesce; a changed root generation restarts or revisits the traversal. Each object
projection reads current ancestry and read boundaries from FDB.


Fan-out cost is one document rewrite per affected object. A change affecting 10M objects requires
10M document rewrites. At 5,000 successful document writes per second, that alone takes about
33 minutes. Thirty-minute freshness requires at least 5,556 writes/s for this event, plus capacity
for content reads, traversal, refresh, and ordinary traffic. Benchmark throughput against aggregated document sizes.
We will size the ES cluster accordingly.

## Index eligibility

Reserve the xattr `dfs.search.exclude`. Its presence excludes the object from all search, including
name and metadata; an empty value still excludes it. Removing it re-enables indexing. On a directory,
it excludes the entire subtree. A child cannot override an excluded ancestor.

Setting or removing the xattr creates a subtree job when needed. 

MIME policy controls **content indexing**, independently of all-search exclusion. Aggregate accepted
file content into one text field, without parsing or transforming HTML, JSON, or XML.

Stating the obvious maybe but here are the mimetypes we will support initially.

| MIME range | Initial policy |
| --- | --- |
| `text/*` | Index aggregated file content as text. |
| `application/json`, `application/*+json` | Index aggregated file content as text. |
| Binary MIME type with a configured webhook | Index metadata immediately; add extracted text when the processor publishes it. |
| Other MIME types | Metadata-only. |

## Post-processing

PDF, DOCX, PPTX, and other documents considered as "rich text" (Frames also fall in this bucket), also not indexable as such, are real use-cases for search.
This section proposes a design in which DFS will fire a webhook to front (or any other service, configurable via a cli), that will post process it and insert a text document, that will get merge this the origin file's document (`text` field will be populated).

### MIME webhooks

Store a global mapping from normalized MIME type to HTTP URL in FDB, managed through the CLI.
Use `dfs-v1-{env}/search-webhook/<mimeType>` for the URL and configuration version, shared by all tenants.

Queue events (## Durable Queue) carry `event_type = new | update`, and we fire webhooks on new + matching mimetype in the FDB index.

### Extracted-text objects

For original file `B = report.pdf`, the processor publishes a text object `A` with the reserved
xattr `dfs.search.text_object_id = B.id`. The value names B and the search worker captures the change via durable queue, and rebuilds ES document `(tenant_id, B.id)`.
The name, MIME type, ancestry, permissions, and other metadata all come from `B`. 


## Durable FDB queue

One durable queue in FDB holds all indexing work. When a DFS server changes an object, it records an event in the same transaction.
A worker later reads that record, updates Elasticsearch, and saves its progress.
If the worker crashes, another worker resumes from the saved progress.

### Small glossary

- **Partition:** an ordered queue of events that a worker processes independently of other partitions. A partition belongs to ONE worker, and a worker can have multiple partitions.
- **Partition key:** `(tenant_id, target_object_id)`. Its hash modulo the partition count selects the partition. An original and its extracted text share a target and partition.
- **Offset:** an event's position, ordered by FDB commit versionstamp.
- **Checkpoint:** the last offset through which all work is completed or durably saved for retry or subtree processing.
- **Consumer group:** workers maintaining one Elasticsearch index, sharing partitions and tracking progress independently of other groups. You create new consumer groups want you want to reprocess events from the past.
- **Lease:** a worker's temporary ownership of a partition within a group. A fencing token prevents former owners from saving progress.
- **At-least-once delivery:** work may run again after a crash if its completion was not checkpointed.

The following rules apply to those records:

| Property | Decision |
| --- | --- |
| Enqueue | Same FDB transaction as the source mutation. |
| Partitions | Start with 128, subject to benchmarks. Partition count can grow independently of worker count. |
| Offsets | A checkpoint names a position in one partition and partition layout version. Missing positions from compaction are expected. |
| Consumer groups | One per Elasticsearch index generation; each group tracks its own partition offsets. |
| Ownership | Within a group, a worker can own multiple partitions; each partition has at most one worker, enforced by an exclusive lease. |
| Progress | The owning worker advances the partition's committed offset after all preceding events are processed or durably transferred to retry work. Compacted gaps are skipped. |
| Delivery | At least once. Acknowledge after successful indexing or durable transfer to retry work. |
| Retention | Keep unresolved work for active groups. An expired group must rebuild from source data before resuming. |

A **partition layout** records a partition count and its version. Partition assignment uses
`hash(tenant_id, target_object_id) % partition_count`. Increasing the count from 128 to 256 moves some
objects to different partitions, while their pending events still live under the old partitioning.
Separate layouts let workers drain old partitions while processing new ones, with independent
leases and checkpoints. See ### Increasing partitions for more on that.

### Compaction

**Compaction** combines repeated changes to the same object into one pending event. For example,
if a file is edited three times before a worker reads its event, the worker needs to index the
current file, not publish all three intermediate versions. Look up pending
work by `(tenant_id, object_key)`, keeping original and extracted-text events distinct. Replace the old event
with a new event that combines the required work at the new commit's offset, in the same FDB
transaction as the source change. A storage locator can have one pending event. A pending `new`
followed by updates remains `new`, with the latest source state; subsequent events are `update`.
Removal work supersedes extraction delivery for a source that no longer exists.

Moving the event to a later offset leaves a gap at its old position. Workers skip that gap and
eventually read the replacement; offsets need not be consecutive.

Events carry the storage locator, target object ID, event type, source version, and work needed;
they do not contain `Attr`, `ExtendedMetadata`, or block contents. Workers resolve the source family,
fetch current original metadata and native or extracted text, and rebuild the target document.
Repeated writes coalesce into one reindex request per locator while preserving webhook obligations.

Compaction preserves outstanding work, including descendant updates and object
removals. Keep the oldest pending timestamp for lag tracking;
acknowledge only the processed event version so a concurrent update stays pending.

### Data model

We will store the queue under a `search/` FDB subspace.

| Key | Value |
| --- | --- |
| `routing` | Current producer layout version. |
| `layout/<layout>` | Partition count and lifecycle state: active, draining, or retired. |
| `event/<layout>/<partition>/<offset>` | Tenant ID, structured object key, target object ID, event type, source version, work flags, subtree generation when needed, and oldest pending timestamp. |
| `pending/<tenant_id>/<object_key>` | Pointer to the current event: layout, partition, and offset. The object key is encoded as a tuple value. Independent of consumer group and partition layout. |
| `group/<group>` | Target Elasticsearch index, lifecycle state, and registered layouts. Only active groups hold back queue retention. |
| `checkpoint/<group>/<layout>/<partition>` | Last committed offset. |
| `lease/<group>/<layout>/<partition>` | Worker ID, expiry, and a monotonically increasing fencing token. |
| `retry/<group>/<layout>/<partition>/<retry_id>` | Storage locator, target object ID, event version, remaining work, publication revision if already assigned, attempt count, and next attempt time. Preserve the oldest pending timestamp. |
| `subtree/<group>/<layout>/<partition>/<job_id>` | Root object, root generation, durable traversal frontier and cursor, and oldest pending timestamp. Split large frontiers across bounded records. |
| `revision/<tenant_id>/<target_object_id>` | Monotonically increasing publication revision shared across all layouts and both original and extracted-text events. |

Examples below omit the `search/` prefix. IDs and times are shortened for readability; `v100`
and `v101` stand for ordered FDB versionstamps, including the transaction-local discriminator.
Values use illustrative JSON; arrays represent logical tuple keys. Assume target `file-X` in
`tenant-A` maps to partition 17 in layout 1. In key examples, `object-key-X` abbreviates the encoded
`("object", "file-X")` tuple.

**`routing` — where new events go.**

```text
routing = {"layout": 1}
```

A writer reads layout 1 before choosing a partition. During expansion, switching this value to 2
makes new events use layout 2; concurrent enqueue transactions that read 1 must retry.

**`layout` — how many partitions that layout has.**

```text
layout/1 = {"partition_count": 128, "state": "active"}
```

Layout 1 has partitions 0–127. After switching to layout 2, mark layout 1 as draining until active
groups finish its events, retries, and subtree jobs; then mark it retired.

**`event` — the indexing work to process.**

```text
event/1/17/v100 = {
  "tenant_id": "tenant-A", "object_key": ["object", "file-X"],
  "target_object_id": "file-X", "event_type": "update", "source_content_version": 7,
  "work": ["reindex_object"],
  "oldest_pending_at": "10:00:00"
}
```

The file edit and this event commit together. The worker scans partition 17, reaches `v100`, and
reads the file's current metadata and content from FDB to replace its ES document.

An extracted-text publication uses the same queue and target partition:

```text
event/1/17/v102 = {
  "tenant_id": "tenant-A", "object_key": ["search-text", "text-A", "object"],
  "target_object_id": "file-X", "event_type": "new", "source_content_version": 7,
  "work": ["reindex_object"], "oldest_pending_at": "10:00:05"
}
```

Here `source_content_version` identifies the original version from which `text-A` was extracted.

**`pending` — find that event by object.**

```text
pending/tenant-A/object-key-X = {"layout": 1, "partition": 17, "offset": "v100"}
```

Another edit changes the file. The writer follows this pointer, replaces event `v100` with
`v101`, and points this record to `v101`, all in the source transaction. The replacement preserves
all outstanding work flags and the oldest timestamp, `10:00:00`.

**`group` — which index receives the work.**

```text
group/serving = {"index": "dfs-search-v3", "state": "active", "layouts": [1]}
group/rebuild = {"index": "dfs-search-v4", "state": "active", "layouts": [1]}
```

Both groups consume the queue independently. Finishing work for `dfs-search-v3` does not finish
it for `dfs-search-v4`. If the rebuild group expires, it must backfill before resuming.

**`checkpoint` — how far one group has progressed.**

```text
checkpoint/serving/1/17 = {"offset": "v101"}
checkpoint/rebuild/1/17 = {"offset": "v099"}
```

The serving group has handled everything through `v101`, including durable transfers to retries
or subtree jobs. The rebuild group has not, so event `v101` must remain. Once both reach it, cleanup
can delete it and clear the pending pointer only if that pointer still names `v101`.

**`lease` — who may save progress for that partition.**

```text
lease/serving/1/17 = {"worker_id": "worker-3", "expires_at": "10:00:30", "fencing_token": 8}
```

If worker-3 stops renewing, worker-7 can take over with token 9. A later checkpoint update from
worker-3 carrying token 8 fails the ownership check.

**`retry` — failed work saved so other events can proceed.**

```text
retry/serving/1/17/retry-X = {
  "tenant_id": "tenant-A", "object_key": ["object", "file-X"],
  "target_object_id": "file-X", "event_version": "v101",
  "remaining_work": ["reindex_object"], "publication_revision": 42,
  "attempt_count": 1, "next_attempt_at": "10:00:10", "oldest_pending_at": "10:00:00"
}
```

The document write failed. Save this record and advance the checkpoint to `v101` in the same
transaction, checking the lease. Retry the same publication later with revision 42; rebuilding
from newer source data requires a new revision.

**`subtree` — where a large descendant update resumes.**

```text
subtree/serving/1/23/job-folder-Y = {
  "tenant_id": "tenant-A", "root_object_id": "folder-Y", "root_generation": 7,
  "frontier": ["folder-Y", "folder-Z"],
  "cursor": {"directory": "folder-Y", "after_child_name": "notes.txt"},
  "oldest_pending_at": "10:01:00"
}
```

A read `DENY` insertion on folder-Y requires updating its descendants. The next batch resumes after
`notes.txt`, with folder-Z still to visit. It saves discovered work and cursor progress together.
Another read-boundary change raises the root generation to 8, requiring traversal to restart or revisit
earlier children. Large frontiers use multiple bounded records.

**`revision` — order publications for an object.**

```text
revision/tenant-A/file-X = {"last_assigned": 43}
```

A publication used revision 42; a newer publication uses 43. If the older
request arrives late, Elasticsearch rejects revision 42 for the document already at 43.
Object removals need revision-protected tombstones so an older publication cannot restore a
removed document. Pending removals remain in durable queue or retry work until publication succeeds.

### Increasing partitions

**Only increases are allowed.** Grow the partition count, for example 128 to 256. More partitions
allow more workers to share the work. Adding workers does not itself require more partitions:
existing partitions can be reassigned from workers that own several to the new workers.

1. Create a new partition layout version with the larger count. Register its partitions in every active consumer group.
2. Switch producer routing atomically in FDB. Enqueue transactions read that routing with conflict
   tracking, so writes racing with the switch retry against the new layout.
3. Workers consume both layouts. Existing work drains from the old one; new writes go to the new one.
   A changed object carries its pending work and original enqueue time into the new layout.
4. Retire the old layout after all active groups finish its pending work, retries, and descendant jobs.

Keep compaction state independent of the partition layout. Publication revisions remain
per object across layouts, so older work cannot overwrite a newer result.
New partitions start with new offsets. Run one expansion at a time; after switching producers,
finish forward rather than shrink.

## Worker and backpressure

Workers process each event as follows:

1. **Resolve the source and target in FDB.** Use the event's storage locator. Read the target original's
   attributes, xattrs, `root_id`, and `ancestor_ids`, plus its native text or current published extraction.
   Read content blocks in file order and split large reads across short transactions. Persist any
   required webhook delivery before acknowledging the event; HTTP calls run outside transactions.
2. **Check that the reads agree.** The object may change between transactions. Compare source
   versions across the reads; if they changed, reread the affected data before indexing. For example,
   do not combine a file's old size with blocks read after it was rewritten.
3. **Write the object document to Elasticsearch.** Aggregate content into `text` and use
   `(tenant_id, target_object_id)` as the document ID. Attach an increasing target revision to each publication;
   retries of the same publication keep that revision. Elasticsearch must reject older revisions: 
   a delayed write must not undo a newer update. Object removals also retain a
   revision so an older write cannot recreate them.
4. **Record completion.** A bulk request can succeed for some objects and fail for others. Check
   each document's result. Advance the partition offset only after every required write or removal
   succeeds, or after saving the remaining work durably for retry. This lets other objects proceed
   without losing failed work.

**Control Elasticsearch backpressure by scaling the workers.** Reduce active workers when
Elasticsearch returns 429s or search latency rises. Increase workers gradually when Elasticsearch
has capacity and indexing is falling behind. Pending events stay in FDB and continue to compact.

Each worker has fixed limits on concurrent block reads, bytes buffered for document aggregation,
and in-flight bulk requests, shared across
all its assigned partitions. Reassigning more partitions to fewer workers therefore reduces total
indexing concurrency.

Start with 2–8 MiB bulks and a 30-second refresh interval.
[Elastic indexing guidance](https://www.elastic.co/docs/deploy-manage/production-guidance/optimize-performance/indexing-speed).

Track the queue's oldest pending work and source-to-searchable lag, including refresh, to assess
the freshness cost of scaling down.

## Query path

- Authenticate the session; use its tenant and subjects, and authorize any supplied scope.
- Resolve accessible roots from FDB using user and group read grants, optionally through a server-side cache.
- Use the shared Elasticsearch alias with `routing=tenant_id` from the start. Once tenants target different indices, resolve
  the index from cached FDB placement metadata. Use that index's routing mode.
- Filter tenant, accessible `root_id` values, and metadata in Elasticsearch. Folder scope always
  uses `ancestor_ids` for recursive search.
- Each hit represents one object. Check current permissions before returning its title or an
  excerpt from its aggregated text.
- Stream authorized hits in bounded batches. Keep the API's result and aggregate response-size limits.
  Backend failures terminate the stream with an error; indexing lag can leave stale candidates.

### Streaming and ranking

Retrieve candidates with BM25, rescore a bounded set (for example with learning-to-rank), and stream authorized results with a 350 ms first-batch p95 target, [API.md](API.md#search) defines the stream.

## Tenant routing and growth from zero to hero


### Routing from the start

Enable tenant routing when creating the first shared index. Benchmark candidate primary counts
including 64 and 128 if projected data volume supports them, alongside routing partition sizes
4 and 8. These are experiment inputs, not startup recommendations.

Apply routing consistently from the first indexed document:

- Set `_routing.required=true`. Pass `routing=tenant_id` on every write, read, and deletion,
  including each bulk item. The persisted tenant ID is the authoritative routing key; retain it
  in queued work and tombstones. Incorrect routing can make GET, UPDATE, or DELETE miss the document.
- Use a globally unique `_id`, formed from an unambiguous encoding of tenant ID and object ID.
  ES does not enforce `_id` uniqueness across custom-routing values. Pass routing separately.
- Search that index with `routing=tenant_id`, plus tenant, accessible root, scope, and metadata filters.
  Routing selects shards; the `tenant_id` filter still separates tenants sharing those shards.

`routing_partition_size` is an index-wide setting, not a per-tenant control. Value 1 means ordinary
single-shard custom routing. Partitioned routing requires `1 < routing_partition_size < number_of_shards`
and prohibits `join` mappings. For example, 16 primaries with partition size 4 routes each tenant
to four shards, using `_id` to select each document's shard.
[Elastic routing reference](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/mapping-routing-field).

Keep alias routing unset for shared tenant aliases; alias routing settings can override request
routing and need explicit review. Data streams also require separate review: custom routing needs
`allow_custom_routing` in their template.
[Alias routing](https://www.elastic.co/docs/manage-data/data-store/aliases),
[Data-stream routing](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/mapping-routing-field).

### Tenant statistics and initial layout

We should collect tenant and MIME-type distributions before choosing the production layout, along with read and write operations.
GCS does not give a lot of stats out of the box, scripts are needed and might take time (rate limiting etc etc)

Ideally we want to have, per tenant:

- number of objects, per mime type
- total bytes
- number of reads, writes per second, on avg, and max

### Shard size: read and write tradeoffs

Elastic's 10–50 GB guidance is a starting point, not a hard shard-size limit.
Its docs allow smaller or larger shards after workload-specific testing. 
Larger shards reduce per-shard overhead but can increase search and recovery time; many small shards consume more heap and coordination work. [Shard sizing guidance](https://www.elastic.co/docs/deploy-manage/production-guidance/optimize-performance/size-shards).

The literature challenges both "small shards are faster" and "fewer shards are always better".
Elastic's shard-sizing analysis distinguishes single-query latency from concurrent throughput:
parallel shard work can shorten one query, while the extra tasks and coordination can reduce
throughput under load. Benchmark concurrent search and indexing together.
[Shard sizing analysis](https://www.elastic.co/blog/how-many-shards-should-i-have-in-my-elasticsearch-cluster).

| Workload | Shard-design hypothesis to test |
| --- | --- |
| Read-heavy, many concurrent tenant searches | Keep per-query shard fanout low. More small shards may add overhead without helping throughput. |
| Read-heavy, expensive queries on large tenants | Smaller shards across a bounded routing partition may reduce latency through parallelism, at the cost of more work per query. |
| Write-heavy imports or frequent whole-document replacement | Enough active primaries can spread indexing across nodes. Too many divide the indexing buffer and increase segment/merge overhead; test larger shards as well. |

Our working hypothesis is a read-latency-sensitive mixed workload: interactive or agent searches
over mostly stable files, with write-heavy imports, extraction completions, and occasional large
subtree rewrites. One ES document per file makes large-file updates expensive. Tenant statistics
must confirm this hypothesis; the current design has no measured read/write ratio.

Benchmark primary shard sizes around 10, 25, 50, and 100 GiB with the same corpus and workload.
The 100 GiB case deliberately tests whether lower overhead wins without breaking the 350 ms p95
or recovery targets. Test total shard count and routing partition size independently. A large initial
shard count can provide distribution headroom, but empty or tiny shards still have a cost.

## ES Cluster sizing

- Deploy across three zones, with one replica in a different zone using shard allocation awareness.
  Start with one data/master node per zone; keep master nodes spread across zones as roles separate.
  [Zone resilience](https://www.elastic.co/docs/deploy-manage/production-guidance/availability-and-resilience/resilience-in-larger-clusters).
- Use 40 GiB per primary shard only as the capacity illustration below; select the production
  target from the workload benchmarks.
  [Shard guidance](https://www.elastic.co/docs/deploy-manage/production-guidance/optimize-performance/size-shards).

Assume primary storage is **1.5x indexable text bytes**, plus **one replica**, for this illustration.
For binary files, measure extracted text separately from original bytes. Validate the multiplier per
MIME type. Shard counts below are capacity estimates, not startup settings; a higher initial count
requires separate heap/CPU sizing, and these disk-based node and cost estimates may understate it.
The table gives aggregate lower bounds for one-node recovery; validate whole-zone recovery capacity
separately. Its cost column is a steady-state subtotal, with the exclusions stated in the heading.

| Indexable text | Primary storage | Capacity shards at 40 GiB | Aggregate disk lower bound | Data nodes | Estimated steady-state Compute Engine and provisioned zonal SSD cost per month (USD), excluding discounts, backups, temporary reindex capacity, inter-zone traffic, load balancing, telemetry, egress, licenses, support, and operations |
| --- | --- | --- | --- | --- | --- |
| 10 GiB | 15 GiB | 1 | 65 GiB | 3 | ~$0.5–0.9k |
| 100 GiB | 150 GiB | 4 | 643 GiB | 3 | ~$0.5–1.0k |
| 500 GiB | 750 GiB | 19 | 3.1 TiB | 3 | ~$1.0–1.4k |
| 1 TiB | 1.5 TiB | 39 | 6.4 TiB | 3 | ~$3.8–5.5k |
| 2 TiB | 3 TiB | 77 | 11.4 TiB | 4 | ~$5.5–8.2k |
| 3 TiB | 4.5 TiB | 116 | 16.1 TiB | 5 | ~$6.8–10.1k |
| 10 TiB | 15 TiB | 384 | 46.8 TiB | 12 | ~$15.6–22.9k |
| 25 TiB | 37.5 TiB | 960 | 111.1 TiB | 28 | ~$35.9–52.2k |
| 50 TiB | 75 TiB | 1,920 | 218.3 TiB | 55 | ~$70.0–101.6k |
| 100 TiB | 150 TiB | 3,840 | 432.5 TiB | 109 | ~$138.2–200.4k |

Self-imposed constraint: after restoring the replica count following loss of one data node,
surviving nodes should average no more than 70% disk utilization, leaving at least 30% free.

For `P` primary bytes, `N` equal-capacity data nodes, and `C` disk bytes per node:

- Aggregate constraint: `2P ≤ 0.70 × (N − 1) × C`.
- Data-node lower bound at 4 TiB/node: `N = max(3, ceil((P * 2) / (0.70 * 4 TiB)) + 1)`.
- Aggregate data-disk lower bound: `(P * 2) / (0.70 * (N - 1) / N)`.

These are aggregate lower bounds, not per-node guarantees. Provision additional per-node margin
for shard-size granularity, uneven shard sizes, allocation constraints, ongoing writes, merges,
translogs, and recovery traffic. Validate maximum node utilization, not only the cluster-wide average.
At 25, 50, and 100 TiB, the post-failure average is about 69.44%, leaving only 22.8 GiB per 4 TiB node
before 70%—less than one nominal 40 GiB shard.

Allocation must also satisfy disk watermarks and zone constraints: aggregate free space does not
help if the nodes eligible for a replica are above their allocation thresholds.
[Disk-based allocation](https://www.elastic.co/docs/reference/elasticsearch/configuration-reference/cluster-level-shard-allocation-routing-settings).
Benchmark maximum utilization and throughput with one node down and with one zone down.

Costs: self-managed GCP `us-central1`, 730 hours/month, on-demand USD before discounts, checked
2026-10-15. Ranges use these benchmark profiles:

- Through 500 GiB: 4–8 vCPU, 16–32 GiB RAM (`n2-standard-4` to `-8`), ~$142–284/node/month.
- From 1 TiB: 16–32 vCPU, 64–128 GiB RAM (`n2-standard-16` to `-32`), ~$567–1,134/node/month.
- Above three data nodes: add three dedicated `n2-standard-4` to `-8` masters. The data-node column
  excludes them; costs include them. The 2 TiB row therefore represents 4 data nodes and 3 masters: 7 VMs.
  [GCP VM prices](https://cloud.google.com/products/compute/pricing/general-purpose).
- All modeled storage is provisioned zonal `pd-ssd`, at ~$0.17/GiB-month. Data disks are 100, 215,
  and 1,072 GiB per node for the first three rows; every data node from the 1 TiB row onward receives
  4 TiB. Each dedicated master receives 100 GiB. The aggregate lower-bound column is not the billed capacity.
  [GCP disk prices](https://cloud.google.com/compute/disks-image-pricing?hl=en).

The subtotal is `data-node compute + dedicated-master compute + 0.17 × provisioned disk GiB`.
It excludes temporary migration capacity and non-core infrastructure. Cross-zone replication and
recovery add separately billed traffic; current same-region inter-zone transfer is $0.01/GiB.
[GCP network prices](https://cloud.google.com/vpc/pricing).
Regional SSD would be about $0.34/GiB-month, twice this zonal storage assumption.
[GCP regional disk prices](https://cloud.google.com/compute/disks-image-pricing).

Live document count equals the number of indexed objects. At 100M objects, 2 KiB of metadata per
document adds ~191 GiB before text or replicas.
