-- Migration created on May 19, 2026
ALTER TABLE "public"."workspaces" ADD COLUMN "regionalModelsOnly" BOOLEAN NOT NULL DEFAULT false;
