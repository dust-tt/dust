import { Op } from "sequelize";

import { getWorkspaceInfos } from "@app/lib/api/workspace";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { makeScript } from "@app/scripts/helpers";

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
    const workspace = await getWorkspaceInfos(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

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

    for (const membership of memberships) {
      scriptLogger.info(
        {
          membershipId: membership.id,
          userId: membership.userId,
          groupId: membership.groupId,
          currentEndAt: membership.endAt,
        },
        execute ? "Unrevoking membership" : "Dry run: would unrevoke membership"
      );

      if (execute) {
        await membership.update({ endAt: null });
      }
    }

    scriptLogger.info(
      { updatedCount: memberships.length },
      execute ? "Done" : "Dry run complete"
    );
  }
);
