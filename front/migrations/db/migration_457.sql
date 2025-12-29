-- Migration created on Dec 29, 2025
ALTER TABLE "skill_configurations"
    ALTER COLUMN "authorId" DROP NOT NULL;
