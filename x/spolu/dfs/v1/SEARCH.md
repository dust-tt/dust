# Search

The server embeds LanceDB OSS 0.39.0 and runs one indexing task. Tables live under
`<DFS_PREFIX>/search`, one per workspace. [DESIGN-SEARCH.md](DESIGN-SEARCH.md) defines semantics;
[PLAN-SEARCH.md](PLAN-SEARCH.md) tracks implementation.

Use the normal session key for keyword or metadata-only searches:

```sh
printf '%s' '{"query":"needle","filter":{"mime_types":["text/plain"],"xattrs":[{"name":"team","value":[100,101,118]}]},"limit":20}' |
  ./target/release/dfs --key-file session.key search-files
printf '%s' '{"workspace_id":"example"}' |
  ./target/release/dfs --key-file workspace.key get-index-status
```

An omitted xattr `value` means existence; `[]` means an empty value. Values are binary in gRPC;
the operator CLI represents them as byte arrays. Filters combine with AND. Search is token-based,
case-insensitive OR, with BM25 ranking; an empty query searches metadata. Excerpts are the first
512 characters of supported text, not highlighted matches. Results never contain ancestor paths.

Each request has a fixed SlateDB snapshot and its own bounded metadata/permission cache, discarded
at completion. Every hit must be authorized and match its indexed version. No global permission
cache, permission TTL, replicated grants, or descendant indexing after directory grant/move changes.
Broad queries can return fewer hits with `partial=true` when authorization rejects too many candidates.

| Resource | Default / bound |
| --- | --- |
| LanceDB shared index + metadata RAM cache | 256 MiB (`DFS_SEARCH_CACHE_MIB`) |
| Retained table handles | 32 (`DFS_SEARCH_TABLES`) |
| Concurrent searches | 4 |
| Search candidates / deadline | 4,096 / 10 seconds |
| Per-search authorization cache | 8,192 objects, 16 MiB |
| Hits / response size | Default 20, max 100 / approximately 1 MiB |
| Index batch | 1,024 files, approximately 32 MiB retained text + eight bounded extractions |
| Extracted text | Up to 8 MiB/file; larger, unsupported, or binary files retain metadata only |

Lance uses its native CPU/I/O pools; `LANCE_CPU_THREADS` and `LANCE_IO_THREADS` can constrain them
independently of filesystem RPC admission. Indexing waits for its source snapshot to become durable;
filesystem writes/fsync never wait for indexing. Failed jobs back off, repeated edits coalesce, and
startup resumes pending work. Backfill finishes before queue consumption; extraction uses eight
concurrent file reads. Maintenance runs at the end of a queue pass or every five minutes under load. Missing tables initiate a resumable rebuild. Maintenance updates
indexes, compacts fragments, and retains Lance's default safe old-version cleanup window.
Shutdown finishes the current bounded worker pass and flushes SlateDB; remaining queued work resumes
on restart. It does not promise that all files have been indexed.

Lance 0.39.0 currently requires its `remote` feature to compile an error type used by embedded code;
this server still uses embedded tables, not a hosted service. Its GCS provider also reads legacy
service-account environment aliases, so the executable removes those in a replacement process before
starting its runtime. ADC remains the only GCS identity source.

## Benchmark

```sh
cargo build --release -p dfs-server -p dfs-client --bins --example search_bench
python3 bench/search.py
```

Uses jd's unchanged seed-42 10,000-file corpus, populates it through gRPC, waits for indexing, and
restarts the server before **each** cold query. Ten warm repeats use the same server/connection;
timing excludes client connection setup. This measures the search API, not recursive grep through FUSE.
Cold starts include normal background-worker startup activity; no previous-process RAM/disk cache is
reused. Raw results include population, remaining index drain, and shutdown drain separately.
A successful run deletes only its generated GCS prefix. `--local-store` supports offline validation.
