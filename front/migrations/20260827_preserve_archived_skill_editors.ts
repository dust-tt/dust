import { Authenticator } from "@app/lib/auth";
import { GroupSkillModel } from "@app/lib/models/skill/group_skill";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { UserResource } from "@app/lib/resources/user_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { ModelId } from "@app/types/shared/model_id";
import type { LightWorkspaceType } from "@app/types/user";
import { Op } from "sequelize";

// Backfill: give archived skills the `editor` grants their legacy skill_editors group still holds
// as *suspended* memberships, so restoring the skill restores its editors.
//
// Archiving a skill suspends its editor memberships. The editor backfill
// (20260817_backfill_skill_editor_user_grants) reads `listEditors`, which is active-only, so it
// skipped every archived skill: those editors live nowhere but the legacy group, and
// 20260820_delete_skill_editors_groups is about to delete it. Run this before that one.
//
// The grants are written through `grantToUser` (which adds the member as active), then the whole
// grant group is suspended, matching what `archive` does and what `restore` expects.
//
// Idempotent: a skill that already has a grant group is skipped, so a second run cannot re-activate
// the memberships this one suspended.

const WORKSPACE_CONCURRENCY = 8;

interface LegacyEditorGroup {
  legacyGroupId: ModelId;
  skillModelId: ModelId;
}

// The skill -> legacy editor group links, straight from the model: `SkillResource` cannot list
// skills whose requested spaces are restricted or deleted, and those skills need the backfill too.
async function listArchivedSkillLegacyGroups(
  auth: Authenticator,
  workspaceModelId: ModelId
): Promise<LegacyEditorGroup[]> {
  const groupSkills = await GroupSkillModel.findAll({
    attributes: ["groupId", "skillConfigurationId"],
    where: { workspaceId: workspaceModelId },
  });
  if (groupSkills.length === 0) {
    return [];
  }

  const groups = await GroupResource.fetchByModelIds(
    auth,
    [...new Set(groupSkills.map((gs) => gs.groupId))],
    { groupKinds: ["skill_editors"] }
  );
  const legacyGroupIds = new Set(groups.map((group) => group.id));

  const archivedSkills = await SkillConfigurationModel.findAll({
    attributes: ["id"],
    where: {
      workspaceId: workspaceModelId,
      status: "archived",
      id: {
        [Op.in]: [...new Set(groupSkills.map((gs) => gs.skillConfigurationId))],
      },
    },
  });
  const archivedSkillIds = new Set(archivedSkills.map((skill) => skill.id));

  return groupSkills
    .filter(
      (gs) =>
        legacyGroupIds.has(gs.groupId) &&
        archivedSkillIds.has(gs.skillConfigurationId)
    )
    .map((gs) => ({
      legacyGroupId: gs.groupId,
      skillModelId: gs.skillConfigurationId,
    }));
}

// The legacy group's members, whatever their membership status: on an archived skill they are all
// suspended, which is precisely why the active-only backfill missed them.
async function listLegacyMemberIds(
  legacyGroupId: ModelId,
  workspaceModelId: ModelId
): Promise<ModelId[]> {
  const now = new Date();
  const memberships = await GroupMembershipModel.findAll({
    attributes: ["userId"],
    where: {
      groupId: legacyGroupId,
      workspaceId: workspaceModelId,
      status: { [Op.in]: ["active", "suspended"] },
      startAt: { [Op.lte]: now },
      [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: now } }],
    },
  });

  return [...new Set(memberships.map((membership) => membership.userId))];
}

async function preserveWorkspaceArchivedSkillEditors(
  execute: boolean,
  logger: Logger,
  workspace: LightWorkspaceType
): Promise<void> {
  // All groups: the skills involved may reference restricted spaces, which the default auth cannot
  // read.
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId, {
    dangerouslyRequestAllGroups: true,
  });
  const workspaceModelId = auth.getNonNullableWorkspace().id;

  const legacyGroups = await listArchivedSkillLegacyGroups(
    auth,
    workspaceModelId
  );
  if (legacyGroups.length === 0) {
    return;
  }

  let skillsWritten = 0;
  let editorsWritten = 0;
  let skillsSkipped = 0;
  let usersDropped = 0;

  for (const { legacyGroupId, skillModelId } of legacyGroups) {
    // Already migrated (or the skill kept an active editor the first backfill caught): leave it
    // alone rather than risk re-activating suspended memberships.
    const existingGrantGroup =
      await GroupPermissionResource.findRegularAutoGroupForGrant(auth, {
        grantType: "editor",
        resourceType: "skill",
        resourceId: skillModelId,
      });
    if (existingGrantGroup) {
      skillsSkipped += 1;
      continue;
    }

    const memberIds = await listLegacyMemberIds(
      legacyGroupId,
      workspaceModelId
    );
    if (memberIds.length === 0) {
      continue;
    }

    const users = await UserResource.fetchByModelIds(memberIds);
    // `grantToUser` refuses a user who is no longer a member of the workspace, and their editorship
    // is gone either way.
    const { memberships } = await MembershipResource.getActiveMemberships({
      users,
      workspace,
    });
    const activeUserIds = new Set(
      memberships.map((membership) => membership.userId)
    );
    const usersToGrant = users.filter((user) => activeUserIds.has(user.id));
    usersDropped += users.length - usersToGrant.length;

    if (usersToGrant.length === 0) {
      continue;
    }

    if (!execute) {
      logger.info(
        {
          workspaceId: workspace.sId,
          skillModelId,
          legacyGroupId,
          editorCount: usersToGrant.length,
        },
        "Dry run: would grant and suspend the archived skill's editors"
      );
      skillsWritten += 1;
      editorsWritten += usersToGrant.length;
      continue;
    }

    for (const user of usersToGrant) {
      const result = await GroupPermissionResource.grantToUser(auth, {
        user: user.toJSON(),
        grantType: "editor",
        resourceType: "skill",
        resourceId: skillModelId,
      });
      if (result.isErr()) {
        logger.error(
          {
            workspaceId: workspace.sId,
            skillModelId,
            userId: user.sId,
            error: result.error.message,
          },
          "Failed to grant an archived skill editor"
        );
      }
    }

    // The skill is archived, so its editors must be suspended: `restore` only brings back
    // memberships with status "suspended".
    const grantGroup =
      await GroupPermissionResource.findRegularAutoGroupForGrant(auth, {
        grantType: "editor",
        resourceType: "skill",
        resourceId: skillModelId,
      });
    if (!grantGroup) {
      logger.error(
        { workspaceId: workspace.sId, skillModelId },
        "No grant group after granting the archived skill's editors"
      );
      continue;
    }
    const suspended = await grantGroup.suspendMembers(auth);

    skillsWritten += 1;
    editorsWritten += suspended.length;

    logger.info(
      {
        workspaceId: workspace.sId,
        skillModelId,
        legacyGroupId,
        grantGroupId: grantGroup.id,
        editorCount: suspended.length,
      },
      "Preserved the archived skill's editors as suspended members"
    );
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      legacyGroups: legacyGroups.length,
      skillsWritten,
      editorsWritten,
      skillsSkipped,
      usersDropped,
    },
    "Completed archived skill editor preservation for workspace"
  );
}

makeScript(
  {
    wId: { type: "string", required: false },
  },
  async ({ wId, execute }, logger) => {
    logger.info("Starting archived skill editor preservation");

    await runOnAllWorkspaces(
      async (workspace) => {
        await preserveWorkspaceArchivedSkillEditors(execute, logger, workspace);
      },
      { concurrency: WORKSPACE_CONCURRENCY, wId }
    );

    logger.info("Archived skill editor preservation completed");
  }
);
