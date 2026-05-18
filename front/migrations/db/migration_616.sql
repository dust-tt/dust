-- Migration created on May 2, 2026
ALTER TABLE "public"."project_metadata"
ADD COLUMN "todoGenerationEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "public"."project_metadata"
ADD COLUMN "initialTodoAnalysisLookback" VARCHAR(32);