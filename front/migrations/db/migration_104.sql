-- Migration created on Oct 11, 2024
ALTER TABLE "public"."agent_user_relations" ADD COLUMN "favorite" BOOLEAN NOT NULL DEFAULT false;
