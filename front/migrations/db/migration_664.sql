-- Migration created on Jun 02, 2026
ALTER TABLE "public"."skill_references" RENAME COLUMN "childSkillId" TO "childCustomSkillId";
ALTER TABLE "public"."skill_references" ADD COLUMN "childGlobalSkillId" VARCHAR(255);
ALTER TABLE "public"."skill_references" ALTER COLUMN "childCustomSkillId" DROP NOT NULL;

CREATE INDEX CONCURRENTLY "skill_references_child_global_skill_id_idx"
ON "public"."skill_references" ("workspaceId", "childGlobalSkillId")
WHERE "childGlobalSkillId" IS NOT NULL;
