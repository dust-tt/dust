-- Migration created on Jun 10, 2026
ALTER TABLE "public"."self_improving_skills_usage" ADD COLUMN "priceAwuCredits" BIGINT NOT NULL DEFAULT 0;