import type { Logger } from "@app/logger/logger";
import { Op } from "sequelize";

import { GroupSkillModel } from "@app/lib/models/skill/group_skill";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";
import { AGENT_GROUP_PREFIX, SKILL_GROUP_PREFIX } from "@app/types/groups";

/**
 * This migration changes all groups that are associated with skills from
 * kind "agent_editors" to "skill_editors". It also updates their names
 * to use SKILL_GROUP_PREFIX instead of AGENT_GROUP_PREFIX.
 */

async function migrateSkillEditorGroups(
  execute: boolean,
  logger: Logger,
  workspace: LightWorkspaceType
): Promise<void> {
  // Find all group-skill associations for this workspace.
  const groupSkillAssociations = await GroupSkillModel.findAll({
    where: {
      workspaceId: workspace.id,
    },
    attributes: ["groupId"],
  });

  if (groupSkillAssociations.length === 0) {
    logger.info(
      { workspaceId: workspace.sId },
      "No skill-group associations found, skipping"
    );
    return;
  }

  const groupIds = [...new Set(groupSkillAssociations.map((gs) => gs.groupId))];

  // Find groups that are of kind "agent_editors" (not already "skill_editors").
  const groupsToMigrate = await GroupModel.findAll({
    where: {
      id: { [Op.in]: groupIds },
      workspaceId: workspace.id,
      kind: "agent_editors",
    },
  });

  if (groupsToMigrate.length === 0) {
    logger.info(
      { workspaceId: workspace.sId },
      "No groups to migrate (all already skill_editors or no agent_editors groups found)"
    );
    return;
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      groupCount: groupsToMigrate.length,
    },
    `Found ${groupsToMigrate.length} groups to migrate from agent_editors to skill_editors`
  );

  await concurrentExecutor(
    groupsToMigrate,
    async (group) => {
      const oldName = group.name;
      // Replace AGENT_GROUP_PREFIX with SKILL_GROUP_PREFIX in the name
      const newName = oldName.replace(AGENT_GROUP_PREFIX, SKILL_GROUP_PREFIX);

      logger.info(
        {
          workspaceId: workspace.sId,
          groupId: group.id,
          oldKind: group.kind,
          newKind: "skill_editors",
          oldName,
          newName,
        },
        "Migrating group"
      );

      if (execute) {
        // If reusing this group-kind update, also update the denormalized
        // group_vaults.groupKind. See https://github.com/dust-tt/dust/pull/29239.
        await group.update({
          kind: "skill_editors",
          name: newName,
        });
      }
    },
    { concurrency: 4 }
  );

  logger.info(
    { workspaceId: workspace.sId },
    `Skill editor groups migration completed for workspace`
  );
}

makeScript(
  {
    wId: { type: "string", required: false },
  },
  async ({ wId, execute }, logger) => {
    logger.info("Starting skill editor groups migration");

    await runOnAllWorkspaces(
      async (workspace) => {
        await migrateSkillEditorGroups(execute, logger, workspace);
      },
      { concurrency: 4, wId }
    );

    logger.info("Skill editor groups migration completed");
  }
);
