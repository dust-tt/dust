-- remote_mcp_servers holds ~5.5k live rows in ~140MB (~0.3 rows/page) because the tool-sync
-- loop rewrites rows continuously and the file never shrinks. The sparse, uncorrelated heap
-- makes the planner pick a BitmapAnd plan (~315 buffer hits/call) for the hot
-- `id IN (...) AND workspaceId = ?` query (#1 query on front DB, ~10% of total DB time).
-- Rewriting the table clustered by (workspaceId, id) restores compactness and correlation,
-- which flips the plan to a plain workspace-index scan (~15 buffer hits/call).
-- fillfactor 90 keeps in-page slack so the sync loop's updates stay HOT and the layout lasts.
-- CLUSTER takes an ACCESS EXCLUSIVE lock; the rewrite is a few seconds on this table size and
-- lock_timeout aborts the attempt if the lock cannot be acquired quickly.
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;

ALTER TABLE remote_mcp_servers SET (fillfactor = 90);

-- The composite (workspaceId, id) index is named remote_mcp_server_workspace_id_id on
-- databases that predate the squashed baseline migration and
-- remote_mcp_servers_workspace_id_id on databases created from it, so resolve the name at
-- runtime. CLUSTER cannot run inside a transaction block (hence no DO block): \gexec runs the
-- generated statement directly in this autocommit psql session.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    WHERE i.indrelid = 'public.remote_mcp_servers'::regclass
      AND c.relname IN ('remote_mcp_server_workspace_id_id', 'remote_mcp_servers_workspace_id_id')
  ) THEN
    RAISE EXCEPTION 'composite (workspaceId, id) index not found on remote_mcp_servers';
  END IF;
END
$$;

SELECT format('CLUSTER remote_mcp_servers USING %I', c.relname)
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
WHERE i.indrelid = 'public.remote_mcp_servers'::regclass
  AND c.relname IN ('remote_mcp_server_workspace_id_id', 'remote_mcp_servers_workspace_id_id')
\gexec

ANALYZE remote_mcp_servers;
