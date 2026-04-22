-- Migration created on Apr 22, 2026
ALTER TABLE "skill_suggestions"
    ADD COLUMN "updatedByUserId" BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
