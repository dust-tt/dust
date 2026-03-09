import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { UserResource } from "@app/lib/resources/user_resource";
import { makeScript } from "@app/scripts/helpers";
import { removeNulls } from "@app/types/shared/utils/general";
import { Op } from "sequelize";

makeScript(
  {
    workspaceId: {
      type: "string",
      alias: "w",
      description: "Workspace sId",
      demandOption: true,
    },
    userIds: {
      type: "array",
      description: "List of user IDs (space-separated)",
      demandOption: true,
    },
    afterDate: {
      type: "string",
      description: "Only memberships with endAt > this date (ISO format)",
      demandOption: true,
    },
    beforeDate: {
      type: "string",
      description:
        "Only memberships with endAt < this date (ISO format, defaults to now)",
      demandOption: false,
    },
  },
  async (
    { workspaceId, userIds, afterDate, beforeDate, execute },
    scriptLogger
  ) => {
    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
    const workspace = auth.getNonNullableWorkspace();

    const parsedUserIds = userIds.map((id) => parseInt(id, 10));
    const parsedAfterDate = new Date(afterDate);
    const parsedBeforeDate = beforeDate ? new Date(beforeDate) : new Date();

    if (isNaN(parsedAfterDate.getTime())) {
      throw new Error(`Invalid afterDate format: ${afterDate}`);
    }

    if (isNaN(parsedBeforeDate.getTime())) {
      throw new Error(`Invalid beforeDate format: ${beforeDate}`);
    }

    scriptLogger.info(
      {
        workspaceId: workspace.sId,
        userIds: parsedUserIds,
        afterDate: parsedAfterDate.toISOString(),
        beforeDate: parsedBeforeDate.toISOString(),
      },
      "Unrevoking group memberships"
    );

    // Find revoked memberships
    const memberships = await GroupMembershipModel.findAll({
      where: {
        workspaceId: workspace.id,
        userId: { [Op.in]: parsedUserIds },
        endAt: { [Op.gt]: parsedAfterDate, [Op.lt]: parsedBeforeDate },
      },
    });

    scriptLogger.info(
      { count: memberships.length },
      "Found memberships to unrevoke"
    );

    // Group by groupId for efficient fetching
    const groupIdToUserIds = new Map<number, number[]>();
    for (const m of memberships) {
      const existing = groupIdToUserIds.get(m.groupId) ?? [];
      existing.push(m.userId);
      groupIdToUserIds.set(m.groupId, existing);
    }

    // Fetch all groups and users
    const groups = await GroupResource.fetchByModelIds(auth, [
      ...groupIdToUserIds.keys(),
    ]);
    const allUserIds = [...new Set(memberships.map((m) => m.userId))];
    const users = await UserResource.fetchByModelIds(allUserIds);
    const userById = new Map(users.map((u) => [u.id, u]));

    for (const group of groups) {
      const userIdsForGroup = groupIdToUserIds.get(group.id) ?? [];
      const usersForGroup = removeNulls(
        userIdsForGroup.map((id) => userById.get(id))
      ).map((u) => u.toJSON());

      scriptLogger.info(
        {
          userIds: usersForGroup.map((u) => u.id),
          groupId: group.id,
          groupName: group.name,
        },
        execute ? "Adding members to group" : "Dry run: would add members"
      );

      if (execute) {
        if (!group.canWrite(auth)) {
          scriptLogger.error(
            { groupId: group.id },
            "Unauthorized to add members to group"
          );
          continue;
        }
        const result = await group.dangerouslyAddMembers(auth, {
          users: usersForGroup,
        });
        if (result.isErr()) {
          scriptLogger.error(
            { groupId: group.id, error: result.error },
            "Failed to add members"
          );
        }
      }
    }

    scriptLogger.info(
      { membershipCount: memberships.length },
      execute ? "Done" : "Dry run complete"
    );
  }
);
