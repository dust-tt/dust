-- Migration created on May 07, 2026
ALTER TABLE "skill_configurations"
ADD COLUMN "selfImprovementCostsCapMicroUsd" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "skill_configurations"
ADD COLUMN "selfImprovementLock" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "skill_configurations"
ALTER COLUMN "reinforcement" SET DEFAULT 'on';
