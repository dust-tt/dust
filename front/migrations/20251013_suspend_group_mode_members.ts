import { Op } from "sequelize";
import type { Logger } from "pino";

import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { makeScript } from "@app/scripts/helpers";

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

    // Find regular groups among those associated with the space
    const regularGroups = await GroupModel.findAll({
      where: {
        id: {
          [Op.in]: groupIds,
        },
        kind: "regular",
        workspaceId: space.workspaceId,
      },
    });

    if (regularGroups.length !== 1) {
      logger.warn(
        {
          spaceId: space.id,
          spaceName: space.name,
          regularGroupsCount: regularGroups.length,
        },
        "Space has unexpected number of regular groups, expected exactly 1. Skipping..."
      );
      continue;
    }

    const defaultGroup = regularGroups[0];

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
      const [updatedCount] = await GroupMembershipModel.update(
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
