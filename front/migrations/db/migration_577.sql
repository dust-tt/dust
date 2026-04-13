-- Migration created on Apr 13, 2026
ALTER TABLE "public"."skill_configurations" ADD COLUMN "reinforcement" VARCHAR(255) NOT NULL DEFAULT 'auto';
ALTER TABLE "public"."skill_configurations" ADD COLUMN "lastReinforcementAnalysisAt" TIMESTAMP WITH TIME ZONE DEFAULT NULL;
