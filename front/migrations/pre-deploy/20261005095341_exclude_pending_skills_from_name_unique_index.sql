SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY skill_configurations_workspace_id_name_status_non_pending ON public.skill_configurations USING btree ("workspaceId", name, status) WHERE ((status)::text <> 'pending'::text);

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
DROP INDEX CONCURRENTLY "public"."skill_configurations_workspace_id_name_status";
