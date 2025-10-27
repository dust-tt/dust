import { QueryTypes } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";

interface InvalidConversation {
  id: number;
  sId: string;
  workspaceId: number;
  missing_group_id: number;
}

makeScript({}, async ({ execute }, logger) => {
  // Get all conversations with non-existing groups in requestedGroupIds
  // eslint-disable-next-line dust/no-raw-sql
  const invalidConversations = await frontSequelize.query<InvalidConversation>(
    `
    SELECT 
      ac.id,
      ac."sId",
      ac."workspaceId",
      requested_group_id as missing_group_id
    FROM conversations ac
    CROSS JOIN UNNEST(ac."requestedGroupIds") as requested_group_id
    WHERE NOT EXISTS (
      SELECT 1 
      FROM groups g 
      WHERE g.id = requested_group_id 
      AND g."workspaceId" = ac."workspaceId"
    ) 
    ORDER BY ac.id, requested_group_id
    `,
    { type: QueryTypes.SELECT }
  );

  logger.info(
    { count: invalidConversations.length },
    `Found ${invalidConversations.length} conversations with invalid groups`
  );

  if (invalidConversations.length === 0) {
    logger.info("No conversations with invalid groups found. Nothing to do.");
    return;
  }

  // Group by conversation id to avoid duplicate processing
  const conversationsPerWorkspace = new Map<number, Set<string>>();

  for (const conv of invalidConversations) {
    const existing = conversationsPerWorkspace.get(conv.workspaceId);
    if (!existing) {
      conversationsPerWorkspace.set(
        conv.workspaceId,
        new Set<string>([conv.sId])
      );
    } else {
      existing.add(conv.sId);
    }
  }

  logger.info(
    { count: conversationsPerWorkspace.size },
    `Found ${conversationsPerWorkspace.size} workspaces with invalid conversations`
  );

  await concurrentExecutor(
    Array.from(conversationsPerWorkspace.entries()),
    async ([workspaceId, conversationIds]) => {
      const workspace = await WorkspaceResource.fetchByModelId(workspaceId);

      if (!workspace) {
        logger.error({ workspaceId }, "Workspace not found for conversation");
        return;
      }

      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      const conversations = await ConversationResource.fetchByIds(
        auth,
        Array.from(conversationIds),
        { dangerouslySkipPermissionFiltering: true }
      );

      if (conversations.length !== conversationIds.size) {
        logger.warn(
          {
            workspaceId: workspaceId,
            missingConversationIds: Array.from(conversationIds).filter(
              (id) => !conversations.some((c) => c.sId === id)
            ),
          },
          "Missing conversations"
        );
      }

      for (const conversation of conversations) {
        logger.info(
          {
            sId: conversation.sId,
            workspaceId: workspaceId,
          },
          execute
            ? "Deleting conversation"
            : "Would delete conversation (dry run)"
        );

        if (execute) {
          await conversation.updateVisibilityToDeleted();
        }
      }
    },
    {
      concurrency: 4,
    }
  );

  logger.info("Migration completed");
});
