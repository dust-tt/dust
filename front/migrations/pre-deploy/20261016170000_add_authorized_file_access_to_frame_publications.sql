-- Share allowlist computed when the publication was published, stamped with the share scope it was
-- computed for. Make-live installs it instead of recomputing unless the scope changed since.
-- Nullable: publications from before this column recompute at activation, as before.

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."frame_publications"
  ADD COLUMN "authorizedFileAccess" jsonb;
