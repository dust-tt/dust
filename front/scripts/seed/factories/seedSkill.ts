import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillFactory } from "@app/tests/utils/SkillFactory";

import type { SeedContext, SkillAsset } from "./types";

export async function seedSkill(
  ctx: SeedContext,
  skillAsset: SkillAsset
): Promise<SkillResource | null> {
  const { auth, execute, logger } = ctx;

  const existingSkills = await SkillResource.listByWorkspace(auth, {
    status: "active",
  });
  const existingSkill = existingSkills.find((s) => s.name === skillAsset.name);

  if (existingSkill) {
    logger.info(
      { sId: existingSkill.sId, name: skillAsset.name },
      "Skill already exists, skipping"
    );
    return existingSkill;
  }

  if (execute) {
    const skill = await SkillFactory.create(auth, {
      name: skillAsset.name,
      agentFacingDescription: skillAsset.agentFacingDescription,
      userFacingDescription: skillAsset.userFacingDescription,
      instructions: skillAsset.instructions,
      status: "active",
    });
    logger.info({ sId: skill.sId }, "Skill created");
    return skill;
  }

  return null;
}
