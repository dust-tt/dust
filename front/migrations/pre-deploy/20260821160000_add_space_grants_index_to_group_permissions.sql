/*
Statement 0
  - Partial index for the space-load path: hydrating a space's groups joins group_permissions on
    (workspaceId, resourceType='space', resourceId). Scoping the index to space grants keeps the
    hottest slice small and cache-resident regardless of how the polymorphic table grows.
  - INDEX_BUILD: This might affect database performance. Concurrent index builds require a non-trivial amount of CPU, potentially affecting database performance. They also can take a while but do not lock out writes.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY group_permissions_space_ws_rid ON public.group_permissions USING btree ("workspaceId", "resourceId") WHERE ("resourceType" = 'space');
