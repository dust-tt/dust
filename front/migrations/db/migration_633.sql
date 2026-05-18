-- Migration created on mai 12, 2026
ALTER TABLE "skill_configurations"
ALTER COLUMN "selfImprovementCostsCapMicroUsd" DROP NOT NULL,
ALTER COLUMN "selfImprovementCostsCapMicroUsd" DROP DEFAULT;
