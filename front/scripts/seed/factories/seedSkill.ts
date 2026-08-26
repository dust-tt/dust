import { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { SkillFactory } from "@app/tests/utils/SkillFactory";

import type { SeedContext, SkillAsset } from "./types";

interface SeedSkillOptions {
  // Create the skill on behalf of this user, making them its only editor. Defaults to the
  // context user.
  owner?: UserResource;
  // Users granted the skill's `editor` grant on top of the owner.
  editors?: UserResource[];
  // Spaces the skill requires access to. Members of the skill that are not members of
  // these spaces cannot view or use it.
  spaces?: SpaceResource[];
}

export async function seedSkill(
  ctx: SeedContext,
  skillAsset: SkillAsset,
  { owner, editors = [], spaces = [] }: SeedSkillOptions = {}
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
      requestedSpaceIds: spaces.map((space) => space.id),
    });
    logger.info(
      { sId: skill.sId, ownerId: owner?.sId ?? auth.getNonNullableUser().sId },
      "Skill created"
    );

    if (editors.length > 0) {
      await addSkillEditors(ownerAuth, skill, editors);
      logger.info(
        { sId: skill.sId, editorIds: editors.map((editor) => editor.sId) },
        "Skill editors added"
      );
    }

    return skill;
  }

  return null;
}

async function addSkillEditors(
  auth: Authenticator,
  skill: SkillResource,
  editors: UserResource[]
): Promise<void> {
  // The owner already holds the grant from creating the skill.
  const existingEditorIds = new Set(
    ((await skill.listEditors(auth)) ?? []).map((member) => member.sId)
  );
  const usersToAdd = editors.filter(
    (editor) => !existingEditorIds.has(editor.sId)
  );
  if (usersToAdd.length === 0) {
    return;
  }

  const addResult = await skill.addEditors(auth, usersToAdd);
  if (addResult.isErr()) {
    throw new Error(`Failed to add skill editors: ${addResult.error.message}`);
  }
}
