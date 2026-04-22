-- Migration created on Apr 22, 2026
ALTER TABLE "skill_suggestions"
    ADD COLUMN "updatedByUserId" BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX CONCURRENTLY "idx_skill_suggestions_updated_by_user_id"
    ON "skill_suggestions" ("updatedByUserId")
    WHERE "updatedByUserId" IS NOT NULL;
