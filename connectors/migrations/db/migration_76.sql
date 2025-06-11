-- Migration created on Jan 08, 2025
ALTER TABLE "public"."github_code_repositories" ADD COLUMN "skipReason" VARCHAR(255);
