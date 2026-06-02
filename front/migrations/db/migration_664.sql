-- Migration created on Jun 02, 2026
ALTER TABLE "public"."skill_references" ADD COLUMN "globalSkillId" VARCHAR(255);
ALTER TABLE "public"."skill_references" ALTER COLUMN "childSkillId" DROP NOT NULL;

ALTER TABLE "public"."skill_references"
ADD CONSTRAINT "skill_references_exactly_one_child_skill"
CHECK (
  (
    "childSkillId" IS NOT NULL
    AND "globalSkillId" IS NULL
  )
  OR (
    "childSkillId" IS NULL
    AND "globalSkillId" IS NOT NULL
  )
) NOT VALID;

ALTER TABLE "public"."skill_references"
VALIDATE CONSTRAINT "skill_references_exactly_one_child_skill";

CREATE INDEX CONCURRENTLY "skill_references_global_skill_id_idx"
ON "public"."skill_references" ("workspaceId", "globalSkillId")
WHERE "globalSkillId" IS NOT NULL;

CREATE UNIQUE INDEX CONCURRENTLY "skill_references_workspace_parent_global_idx"
ON "public"."skill_references" ("workspaceId", "parentSkillId", "globalSkillId")
WHERE "globalSkillId" IS NOT NULL;
