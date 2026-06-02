-- Migration created on Jun 02, 2026
ALTER TABLE "public"."skill_references" ADD COLUMN "globalSkillId" VARCHAR(255);
ALTER TABLE "public"."skill_references" ALTER COLUMN "childSkillId" DROP NOT NULL;

CREATE INDEX CONCURRENTLY "skill_references_global_skill_id_idx"
ON "public"."skill_references" ("workspaceId", "globalSkillId")
WHERE "globalSkillId" IS NOT NULL;

CREATE UNIQUE INDEX CONCURRENTLY "skill_references_workspace_parent_global_idx"
ON "public"."skill_references" ("workspaceId", "parentSkillId", "globalSkillId")
WHERE "globalSkillId" IS NOT NULL;
