/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."memberships" ADD COLUMN "poolCapOverrideExpiresAt" timestamp with time zone;

/*
Statement 1
  - Partial index for memberships.poolCapOverrideExpiresAt
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY memberships_pool_cap_override_expires_at ON public.memberships USING btree ("poolCapOverrideExpiresAt") WHERE ("poolCapOverrideExpiresAt" IS NOT NULL);
