-- Migration created on Nov 20, 2025
ALTER TABLE "public"."run_usages"
ADD COLUMN "costUsd" FLOAT NOT NULL DEFAULT 0;