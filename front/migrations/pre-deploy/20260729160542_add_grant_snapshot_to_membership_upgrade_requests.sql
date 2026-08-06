/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."membership_upgrade_requests" ADD COLUMN "grantedAwuCredits" integer;

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."membership_upgrade_requests" ADD COLUMN "grantedExpiryKind" character varying(24) COLLATE "pg_catalog"."default" DEFAULT NULL::character varying;

/*
Statement 2
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."membership_upgrade_requests" ADD COLUMN "grantedUnlimitedSpend" boolean NOT NULL DEFAULT false;

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."membership_upgrade_requests" ADD COLUMN "grantedSeatType" character varying(255) COLLATE "pg_catalog"."default" DEFAULT NULL::character varying;

/*
Statement 4
  - Index for membership_upgrade_requests(workspaceId, resolvedAt) history listing
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY membership_upgrade_requests_workspace_resolved_at_idx ON public.membership_upgrade_requests USING btree ("workspaceId", "resolvedAt");
