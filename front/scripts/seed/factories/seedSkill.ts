import { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { SkillFactory } from "@app/tests/utils/SkillFactory";

import type { SeedContext, SkillAsset } from "./types";

interface SeedSkillOptions {
  // Create the skill on behalf of this user, making them its only editor. Defaults to the
  // context user.
  owner?: UserResource;
}

export async function seedSkill(
  ctx: SeedContext,
  skillAsset: SkillAsset,
  { owner }: SeedSkillOptions = {}
): Promise<SkillResource | null> {
  const { auth, workspace, execute, logger } = ctx;

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
    const ownerAuth = owner
      ? await Authenticator.fromUserIdAndWorkspaceId(owner.sId, workspace.sId)
      : auth;

    const skill = await SkillFactory.create(ownerAuth, {
      name: skillAsset.name,
      agentFacingDescription: skillAsset.agentFacingDescription,
      userFacingDescription: skillAsset.userFacingDescription,
      instructions: skillAsset.instructions,
      instructionsHtml: skillAsset.instructionsHtml,
      status: "active",
      availability: skillAsset.availability,
    });
    logger.info(
      { sId: skill.sId, ownerId: owner?.sId ?? auth.getNonNullableUser().sId },
      "Skill created"
    );
    return skill;
  }

  return null;
}
