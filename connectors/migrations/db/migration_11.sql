-- Migration created on Aug 05, 2024
ALTER TABLE
    "public"."github_code_repositories"
ADD
    COLUMN "forceDailySync" BOOLEAN NOT NULL DEFAULT false;