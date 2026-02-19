import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillFactory } from "@app/tests/utils/SkillFactory";

import type { SeedContext, SuggestedSkillAsset } from "./types";

export async function seedSuggestedSkills(
  ctx: SeedContext,
  suggestedSkills: SuggestedSkillAsset[]
): Promise<void> {
  const { auth, execute, logger } = ctx;

  const existingSkills = await SkillResource.listByWorkspace(auth, {
    status: "suggested",
  });
  const existingSkillNames = new Set(existingSkills.map((s) => s.name));

  for (const skillAsset of suggestedSkills) {
    if (existingSkillNames.has(skillAsset.name)) {
      logger.info(
        { name: skillAsset.name },
        "Suggested skill already exists, skipping"
      );
      continue;
    }

    logger.info({ name: skillAsset.name }, "Creating suggested skill...");

    if (execute) {
      const skill = await SkillFactory.create(auth, {
        name: skillAsset.name,
        agentFacingDescription: skillAsset.agentFacingDescription,
        userFacingDescription: skillAsset.userFacingDescription,
        instructions: skillAsset.instructions,
        status: "suggested",
      });
      logger.info(
        { sId: skill.sId, name: skillAsset.name },
        "Suggested skill created"
      );
    }
  }
}
