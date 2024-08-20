-- Migration created on Aug 20, 2024
ALTER TABLE "public"."groups" ADD COLUMN "kind" VARCHAR(255) NOT NULL DEFAULT '';