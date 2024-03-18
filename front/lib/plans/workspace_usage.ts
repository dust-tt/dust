import type { WorkspaceType } from "@dust-tt/types";
import { Op, QueryTypes } from "sequelize";

import { Membership, Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";

export async function countActiveSeatsInWorkspace(
  workspaceId: string
): Promise<number> {
  const workspace = await Workspace.findOne({
    where: {
      sId: workspaceId,
    },
  });
  if (!workspace) {
    throw new Error(`Workspace not found for sId: ${workspaceId}`);
  }
  return Membership.count({
    where: {
      workspaceId: workspace.id,
      role: {
        [Op.notIn]: ["none", "revoked"],
      },
    },
  });
}

/**
 * An active user is a user who has posted at least one message during the billing period.
 * To handle Slack users, we are using the userContextEmail field of the message to distinguish users.
 */
export async function countActiveUsersInWorkspaceSince({
  workspace,
  since,
}: {
  workspace: WorkspaceType;
  since: Date;
}): Promise<number> {
  const result = await frontSequelize.query<{
    count: string;
  }>(
    `
      SELECT COUNT(DISTINCT "userMessage"."userContextEmail") as "count"
      FROM "messages" AS "message"
      INNER JOIN "conversations" AS "conversation"
        ON "message"."conversationId" = "conversation"."id"
        AND "conversation"."workspaceId" = :workspaceId
      LEFT OUTER JOIN "user_messages" AS "userMessage"
        ON "message"."userMessageId" = "userMessage"."id"
      WHERE "message"."createdAt" >= :since
      AND "message"."userMessageId" IS NOT NULL
    `,
    {
      replacements: { workspaceId: workspace.id, since: since },
      type: QueryTypes.SELECT,
    }
  );

  if (!result.length) {
    throw new Error(
      `Query to compute active users in workspace retrieved no result.`
    );
  }
  return parseInt(result[0].count, 10);
}
