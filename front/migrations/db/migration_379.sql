-- Migration created on Oct 13, 2025
ALTER TABLE "public"."group_memberships" ADD COLUMN "status" VARCHAR(255) NOT NULL DEFAULT 'active';
