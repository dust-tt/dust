-- Migration created on Oct 14, 2024
ALTER TABLE "public"."github_issues"
ADD COLUMN "skipReason" VARCHAR(255);