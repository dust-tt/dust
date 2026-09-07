# Ranked skill search

Custom skills stay in the workspace-scoped ES index. Global and system skills
stay in their code registries; adding one requires no search migration or sync.

ES and TypeScript use the same fixed relevance tiers: exact name/alias (100),
prefix (80), substring (60), subsequence (40), description substring (20), and
description subsequence (10). The best match wins. Empty queries score 1.
Ties use name and skill ID in ES keyword byte order. Wildcard matching folds
ASCII case only, matching ES 8's behavior. BM25 is not the final ranking.

`GET /api/w/:wId/skills/search` accepts optional `limit` (1–150) and `cursor`.
It returns `skills` with scores and `nextCursor` (null when exhausted).

The backend merges two sorted streams. The ES cursor advances past returned or
permission-rejected candidates, never authorized hits displaced by globals.
Unconsumed hits are refetched. Globals have an independent position.

Cursors are immutable opaque Redis keys with a five-minute TTL, bound to the
workspace, caller, ES query and matching global catalog. Changed eligibility,
catalog or query, missing cursor state, or an expired PIT requires restarting
the search (400). Permission checks still run live on each candidate batch;
a PIT freezes index state, not authorization.

Each request prepares readable non-pod IDs once and runs at most five batches
of 50–200 ES candidates. Pod and canonical DB validation remain batched. A short
or empty page can have a continuation cursor: consumers must use `nextCursor`,
not the number of results, to decide whether search is exhausted.

The first page also opens a PIT. Single-page searches close it immediately;
paginated snapshots expire naturally so earlier cursors remain retryable.
Continuation pages read one Redis cursor, and pages with more results write
one. No skill documents, permission grants or result bodies are cached there.
