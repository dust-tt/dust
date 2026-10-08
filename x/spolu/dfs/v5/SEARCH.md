# v5 object search

`Search` is a session-authenticated gRPC operation for both files and directories. Tenant and grants
come exclusively from the session. Object IDs remain binary UUIDv4 values in Rust, protobuf and FDB.
There is no GetIndexStatus RPC, indexing RPC, cursor, score, global count, or canonical path.

The request contains `query`, optional `fields` (`NAME`, `CONTENT`, default both), optional `scope`
(`directory_id`, `recursive`, default true), optional `filter`, and `limit` (default 20, maximum 100).
An empty query searches metadata only. Plain text matches any normalized token in either selected
field. Directories match their own names and metadata, never aggregated descendant content.
CONTENT-only selection and MIME/size filters select files. Combining DIRECTORY with MIME/size
filters is invalid. Scope requires an authorized real directory, excludes that directory itself,
and selects descendants or immediate children. Virtual root/shared projections are not indexed.

Filters combine with AND: optional FILE/DIRECTORY kind, exact basename, basename prefix, MIME set,
inclusive size/time bounds, and xattr existence or byte-exact equality (including empty bytes).
MIME values combine with OR. Matching names uses analyzed text; equality/prefix uses exact names.
Responses contain `hits[]` of existing `Attr`, basename, and optional file excerpt, plus `partial`
and the existing `ReadView`. Partial describes bounded candidate evaluation, not indexing freshness.
Backend failures return errors, not successful empty results.

## Index and publication

ES stores one derived document per named real object with its current revision, own metadata,
analyzed name, bounded extracted text, and excerpt. UTF-8 text/code/JSON up to 8 MiB is extracted;
unsupported, binary, and larger files remain name/metadata searchable. Excerpts contain at most 512
characters. No grants or ancestor paths are stored in ES. Directory moves and grant changes require
no descendant indexing.

Each filesystem transaction blindly replaces a tenant/object pending row with a random 16-byte job
token. Repeated changes coalesce, including parent membership timestamps and deletion tombstones.
The pending record is durable even when ES is not configured. Workers scan the durable tenant
registry fairly and persist initial/rebuild cursors. Backfill coalesces current-state obligations
without reading each pending key; extraction always reads the latest FDB state. Workers back off
only after an entire idle tenant sweep, so a busy tenant does not sleep between backfill pages.
Filesystem RPC completion never waits for ES. The filesystem format remains `dfs-v5-fdb-6`; search
adds key families 30 (pending objects) and 31 (worker metadata).

Workers obtain ES optimistic publication conditions before reading FDB, extract through short
transactions that check token and revision, and publish bounded conditional bulks with refresh.
Each ES incarnation atomically creates a unique write alias; bulk requests require that alias.
Delayed requests cannot recreate an unmapped index or target its replacement after deletion. The
derived schema is `dfs-v5-es-2`; earlier experimental indices need a new configured index name and
automatic backfill. FDB data is unchanged.
They retain ES deletion tombstones to prevent late resurrection. A completed job is cleared only
when its token still matches in FDB. Failed or ambiguous jobs remain pending with bounded backoff.
Changed ES index UUIDs trigger a resumable backfill. Each FDB deployment prefix must have its own ES
index; neither index names nor storage prefixes may be reused for unrelated deployments.

## Authority and limits

Every ES query uses tenant routing plus an explicit tenant filter. A request opens an ES PIT and
expands candidates with internal search_after, up to 4096 candidates and a ten-second retrieval
budget. FDB snapshots do not span ES requests. Each response validates current object existence and
revision against one FDB snapshot, suppressing stale excerpts and deleted objects. Xattr equality
is verified against FDB after the ES hash prefilter. Responses are bounded to 1 MiB.

The complete tenant RAM tree filters grants and scope under one generation with the configured
permission freshness bound (default 30 seconds). Changed/stale proofs discard the whole response
and use a coherent FDB fallback. Revalidate retained candidates in a new short snapshot on each
expanded search window. Final verification is bounded separately to three seconds per authority
attempt; a failed verification returns an error. No ES field is an authorization authority.

## Configuration and local execution

`--es-url` / `DFS_ES_URL` enables the worker and Search. The filesystem still runs without ES;
Search then returns Unavailable. `--es-index` / `DFS_ES_INDEX` defaults to `dfs-v5-local`.
Search has four concurrent request slots. ES HTTP response bodies are bounded to 16 MiB and never
included in client errors or logs. Worker bulk payloads target 32 MiB with eight bounded extractions.

`docker compose -f local/compose.yaml up -d es` starts an isolated ES 8.15.3 instance on localhost
port 19205. Its dev-container URL is `http://es:9200`; an existing v4 dev container can use
`http://host.docker.internal:19205`. The CLI exposes `dfs-client search` using the usual JSON input
and session-key file. Generated JSON represents NAME/CONTENT and FILE/DIRECTORY as 0/1 respectively.

Implementation and measurements are tracked in [PLAN.md](PLAN.md). No benchmark result is claimed
until its raw report has been inspected.
