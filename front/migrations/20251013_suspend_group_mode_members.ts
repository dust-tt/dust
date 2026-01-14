import { Op } from "sequelize";
import type { Logger } from "pino";

import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { makeScript } from "@app/scripts/helpers";
import { cons } from "fp-ts/lib/ReadonlyNonEmptyArray";

async function suspendGroupModeMembers(
  logger: Logger,
  { execute }: { execute: boolean }
) {
  logger.info(
    "Starting migration to suspend members in group management mode spaces..."
  );

  // Find all spaces with managementMode='group'
  const groupModeSpaces = await SpaceModel.findAll({
    where: {
      managementMode: "group",
    },
  });

  logger.info(
    { count: groupModeSpaces.length },
    "Found spaces with group management mode"
  );

  let totalUpdated = 0;
  let processedSpaces = 0;

  // Process each space
  for (const space of groupModeSpaces) {
    // Find the regular groups associated with this space via junction table
    const groupSpaceJunctions = await GroupSpaceModel.findAll({
      where: {
        vaultId: space.id,
        workspaceId: space.workspaceId,
      },
    });

    // Get the group IDs from the junction table
    const groupIds = groupSpaceJunctions.map((gs) => gs.groupId);

    // Find groups of members among those associated with the space
    const spaceMemberGroups = await GroupModel.findAll({
      where: {
        id: {
          [Op.in]: groupIds,
        },
        kind: {
          [Op.in]: ["space_members"],
        },
        workspaceId: space.workspaceId,
      },
    });

    const spaceEditorGroups = await GroupModel.findAll({
      where: {
        id: {
          [Op.in]: groupIds,
        },
        kind: {
          [Op.in]: ["space_editors"],
        },
        workspaceId: space.workspaceId,
      },
    });

    if (spaceMemberGroups.length !== 1) {
      logger.warn(
        {
          spaceId: space.id,
          spaceName: space.name,
          spaceMembersGroupsCount: spaceMemberGroups.length,
        },
        "Space has unexpected number of space_members groups, expected exactly 1. Skipping..."
      );
      continue;
    }

    if (spaceEditorGroups.length > 1) {
      logger.warn(
        {
          spaceId: space.id,
          spaceName: space.name,
          spaceEditorGroupsCount: spaceEditorGroups.length,
        },
        "Space has unexpected number of space_editors groups, expected at most 1. Skipping..."
      );
      continue;
    }

    const defaultGroup = spaceMemberGroups[0];
    const editorGroup = spaceEditorGroups[0];

    // Find all active memberships in this group
    const activeMemberships = await GroupMembershipModel.findAll({
      where: {
        groupId: defaultGroup.id,
        workspaceId: space.workspaceId,
        status: "active",
        startAt: { [Op.lte]: new Date() },
        [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
      },
    });

    if (activeMemberships.length === 0) {
      logger.info(
        { spaceId: space.id, spaceName: space.name },
        "Space has no active members to suspend"
      );
      processedSpaces++;
      continue;
    }

    if (editorGroup) {
      const activeEditorMemberships = await GroupMembershipModel.findAll({
        where: {
          groupId: editorGroup.id,
          workspaceId: space.workspaceId,
          status: "active",
          startAt: { [Op.lte]: new Date() },
          [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
        },
      });

      if (activeEditorMemberships.length === 0) {
        logger.info(
          { spaceId: space.id, spaceName: space.name },
          "Space has no active editors to suspend"
        );
        processedSpaces++;
        continue;
      }
    }

    logger.info(
      {
        spaceId: space.id,
        spaceName: space.name,
        activeMembersCount: activeMemberships.length,
        groupId: defaultGroup.id,
        groupName: defaultGroup.name,
      },
      "Processing space with active members"
    );

    if (execute) {
      // Update all active memberships to suspended
      let [updatedCount] = await GroupMembershipModel.update(
        { status: "suspended" },
        {
          where: {
            groupId: defaultGroup.id,
            workspaceId: space.workspaceId,
            status: "active",
            startAt: { [Op.lte]: new Date() },
            [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
          },
        }
      );

      if (editorGroup) {
        const [updatedEditorCount] = await GroupMembershipModel.update(
          { status: "suspended" },
          {
            where: {
              groupId: editorGroup.id,
              workspaceId: space.workspaceId,
              status: "active",
              startAt: { [Op.lte]: new Date() },
              [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
            },
          }
        );
        updatedCount += updatedEditorCount;
      }

      totalUpdated += updatedCount;
      logger.info(
        { spaceId: space.id, updatedCount },
        "Updated memberships to suspended status"
      );
    } else {
      logger.info(
        {
          spaceId: space.id,
          membersToUpdate: activeMemberships.length,
        },
        "[DRY RUN] Would update memberships to suspended status"
      );
      totalUpdated += activeMemberships.length;
    }

    processedSpaces++;
  }

  logger.info(
    {
      processedSpaces,
      totalUpdated,
      executed: execute,
    },
    "Migration summary"
  );
}

makeScript({}, async ({ execute }, logger) => {
  await suspendGroupModeMembers(logger, { execute });
});
