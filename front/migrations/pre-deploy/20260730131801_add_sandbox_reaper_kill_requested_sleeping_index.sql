/*
Statement 0
  - INDEX_BUILD: This might affect database performance. Concurrent index builds require a non-trivial amount of CPU, potentially affecting database performance. They also can take a while but do not lock out writes.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY sandboxes_reaper_kill_requested_sleeping_idx ON public.sandboxes USING btree ("lastActivityAt", id) WHERE (("killRequestedAt" IS NOT NULL) AND ((status)::text = 'sleeping'::text));
