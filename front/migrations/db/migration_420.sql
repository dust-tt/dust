-- Migration created on Dec 02, 2025
ALTER TABLE "public"."run_usages"
ADD COLUMN "costMicroUsd" BIGINT NOT NULL DEFAULT 0;