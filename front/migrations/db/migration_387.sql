-- Migration created on Oct 21, 2025
DROP INDEX IF EXISTS "users.users_auth0_sub";
ALTER TABLE "public"."users"
    DROP COLUMN "auth0Sub";
