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
ALTER TABLE "public"."membership_upgrade_requests" ADD COLUMN "grantedExpiresAt" timestamp with time zone;

/*
Statement 2
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."membership_upgrade_requests" ADD COLUMN "expiredAt" timestamp with time zone;

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY membership_upgrade_requests_workspace_resolved_at_idx ON public.membership_upgrade_requests USING btree ("workspaceId", "resolvedAt");

/*
Statement 4
  - Partial index for membership_upgrade_requests active grants
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY membership_upgrade_requests_user_active_grant_idx ON public.membership_upgrade_requests USING btree ("userId", "expiredAt") WHERE ("grantedAwuCredits" IS NOT NULL);
