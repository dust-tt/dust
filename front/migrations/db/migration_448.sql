-- Migration created on Dec 15, 2025
ALTER TABLE "public"."mentions"
ADD COLUMN "status" VARCHAR(255) NOT NULL DEFAULT 'approved';