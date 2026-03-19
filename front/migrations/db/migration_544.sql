-- Migration created on Mar 19, 2026
ALTER TABLE "public"."workspaces"
ADD COLUMN "sharingPolicy" VARCHAR(255) NOT NULL DEFAULT 'all_scopes';