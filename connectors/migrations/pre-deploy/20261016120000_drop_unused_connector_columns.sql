SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;

ALTER TABLE "public"."dust_project_conversations" DROP COLUMN IF EXISTS "lastMessageAt";
ALTER TABLE "public"."gong_users" DROP COLUMN IF EXISTS "emailAliases";
