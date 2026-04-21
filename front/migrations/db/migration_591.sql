-- Migration created on Apr 17, 2026
-- Add a short, user-facing title to skill suggestions. Populated by the reinforcement
-- aggregator for final suggestions; synthetic drafts leave this null.

ALTER TABLE "skill_suggestions" ADD COLUMN "title" VARCHAR(255);
COMMENT ON COLUMN "skill_suggestions"."title" IS 'Short user-facing title (set for final aggregated suggestions).';
