# Embedded Tantivy search

An additive search path inside the RocksDB DFS process. Enable with
`cargo build --release --features lexical-search --bin dfsd`, then supply
`--search-index PATH --search-token-file ADMIN_TOKEN_FILE` to `dfsd`.
One index serves the workspace owned by the configured administrator credential.
The optional HTTP listener defaults to `127.0.0.1:7447` and must be exposed through
a TLS proxy for remote access.

All builds, tests and measurements run on the dedicated
`dfs-tantivy-jd-20261002-server` and client in GCP project `dust-dev`.
Never run local tests or touch the parallel Slate experiment.

## Queries

`POST /v1/workspaces/{workspace}/lexical/{nodes|documents}/query` authenticates the
caller's own DFS Bearer credential. Request and response schemas are served at
`/lexical/openapi.json`; administrator status is at `/lexical/status`.

```json
{"query":{"type":"phrase","terms":"quarterly plan"},"k":20}
```

Nodes support `all`, `node` (with `id`), `exact`, `prefix`, and `substring` (with
`value`). Documents support `all`, `node`, `match`, `phrase` (with `terms`), and
`substring`. Match requires all analyzed terms. Words use simple tokenization,
lowercasing, and a 256-byte token limit; phrases preserve token positions.
Names and literal substring verification are case-sensitive. Literal queries
intersect trigram postings then verify original text before pagination. Strings
shorter than three characters require a candidate scan.

Optional fields are `k` (1–100, default 20), `offset` (0–10000, default 0),
`kind` (`file` or `directory`), and `include_text` (documents only, default false).
Documents return node/version IDs and native Tantivy scores. Scores are not
comparable with Lance and are not guaranteed to match a fresh rebuild after
Tantivy deletions or segment merges. Complete UTF-8 text is available on request;
files above 8 MiB or with binary control characters are not indexed.

## Publication and permissions

Tantivy stores bodies and literal trigrams on local disk, using persistent mmap
readers. Durable metadata sidecars contain stable numeric slots and source metadata.
Each publication holds in-memory name indexes and subtree bitmaps. Current DFS grants select subtree bitmaps. A bounded cache
keys effective masks by principal, scope, policy/namespace versions, and the
owning publication. Filters run before top-k; final DFS validation checks at most
100 returned nodes. Changes to policy during retrieval suppress the page. Changes
to namespace beyond the indexed boundary exclude affected subtrees before ranking.
The body index contains no grants, paths, or names.

Incremental source export uses persisted snapshot leases and the DFS journal.
Ordinary content changes export affected nodes only; grants and group changes
export no nodes. Renames reconcile metadata to catch replaced identities but reuse
unchanged text postings. Recovery, journal gaps and first indexing use full
snapshots. Leases expire sixty seconds after creation or successful renewal,
capped by session expiry; the 4096-change journal bound still applies. A dedicated
renewal thread runs every twenty seconds during source extraction. Extraction
checks renewal success and releases its lease before metadata indexes and commit.
Errors and unwinding stop the renewal worker and release the lease.

One writer durably creates a metadata artifact, commits its name and source
boundary in Tantivy's commit payload, then publishes the paired metadata and
searcher. Requests retain their publication throughout execution. The DFS source
prefix is persisted before extraction. Source restarts trigger reconciliation.
Retained metadata artifacts currently require offline cleanup with the service
stopped; automatic artifact garbage collection is not implemented.

Searches use bounded blocking workers with admission retained until execution
ends, including HTTP timeouts. Indexing runs independently of the filesystem
request executor. The default refresh interval is 250 ms; this is a scheduling
interval, not a freshness guarantee.

Ingestion retains one owned body shared by the text and trigram field views.
A 32 MiB byte budget covers queued and actively consumed documents, releasing
capacity when Tantivy drops each document. Capacity waits have a ten-second
deadline. The two writer threads use Tantivy's existing 64 MiB writer budget.
Neither setting bounds process memory: extraction, metadata, allocator retention,
RocksDB, and mapped files also contribute.

Body ranking keeps a bounded top-k heap and passes its accepted score threshold
to Tantivy's pruning traversal. Deleted, unauthorized, or literal-mismatched
candidates cannot raise that threshold. Common exact phrases use constituent-term
frequencies and the native phrase BM25 weight to skip blocks and documents that
cannot beat the threshold, then verify positions and scores with the native
phrase scorer. Equally selective terms are sampled to choose a tighter bound;
rare phrases use the generic path. Current DFS validation still runs on returned
candidates. These changes preserve the index format and native score/tie ordering.

## Verification

`lexical/cloud-check.sh` runs the feature-enabled DFS suite, Clippy, formatting,
and a release build on the server. Integration tests use actual RocksDB and Tantivy.
The current [three-system results](../../dfs-bench/docs/RESULTS.md),
[method](../../dfs-bench/docs/METHOD.md), and
[topology](../../dfs-bench/docs/TOPOLOGY.md) describe the clean Titanium SSD run.

The older cloud and scale scripts are historical harnesses. Their VMs, saved
corpora, indexes and timing reports were removed; they do not identify the
current deployment or provide a retained baseline. The standalone search service
is no longer part of this prototype. Current builds and queries use Tantivy.
