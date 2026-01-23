-- Migration created on Dec 18, 2025
ALTER TABLE "public"."vaults" ADD COLUMN "conversationsEnabled" BOOLEAN NOT NULL DEFAULT false;
