import { ConversationModel } from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { makeScript } from "@app/scripts/helpers";
import { QueryTypes } from "sequelize";

interface ConversationWithDeletedSpace {
  id: number;
  sId: string;
  workspaceId: number;
  requestedSpaceIds: number[];
}

makeScript(
  {
    spaceId: {
      alias: "s",
      describe:
        "The model ID of the deleted space to remove from conversations",
      type: "number" as const,
      demandOption: true,
    },
    conversationSid: {
      alias: "c",
      describe:
        "Optional conversation sId to fix (if omitted, fixes all affected conversations)",
      type: "string" as const,
      demandOption: false,
    },
  },
  async ({ spaceId, conversationSid, execute }, logger) => {
    // Step 1: Validate that the space is deleted (or doesn't exist at all).
    const [activeSpace] =
      // biome-ignore lint/plugin/noRawSql: script uses raw SQL
      await frontSequelize.query<{ id: number }>(
        `SELECT id FROM vaults WHERE id = :spaceId AND "deletedAt" IS NULL`,
        { replacements: { spaceId }, type: QueryTypes.SELECT }
      );

    if (activeSpace) {
      logger.error(
        { spaceId },
        "Space is still active (not deleted). Refusing to continue."
      );
      return;
    }

    // Step 2: Find affected conversations.
    const conversationFilter = conversationSid
      ? `AND c."sId" = :conversationSid`
      : "";

    const affected =
      // biome-ignore lint/plugin/noRawSql: script uses raw SQL
      await frontSequelize.query<ConversationWithDeletedSpace>(
        `
        SELECT c.id, c."sId", c."workspaceId", c."requestedSpaceIds"
        FROM conversations c
        WHERE :spaceId = ANY(c."requestedSpaceIds")
        ${conversationFilter}
        ORDER BY c.id
        `,
        {
          replacements: {
            spaceId,
            ...(conversationSid ? { conversationSid } : {}),
          },
          type: QueryTypes.SELECT,
        }
      );

    logger.info(
      { count: affected.length, spaceId, conversationSid, execute },
      execute
        ? `Found ${affected.length} conversation(s) to fix`
        : `[DRY RUN] Found ${affected.length} conversation(s) that would be fixed`
    );

    if (affected.length === 0) {
      return;
    }

    let updatedCount = 0;
    let errorCount = 0;

    for (const conversation of affected) {
      const newSpaceIds = conversation.requestedSpaceIds.filter(
        (id) => Number(id) !== spaceId
      );

      logger.info(
        {
          conversationSid: conversation.sId,
          workspaceId: conversation.workspaceId,
          originalSpaceIds: conversation.requestedSpaceIds,
          newSpaceIds,
          execute,
        },
        execute
          ? "Removing deleted space from conversation"
          : "[DRY RUN] Would remove deleted space from conversation"
      );

      if (execute) {
        try {
          await ConversationModel.update(
            { requestedSpaceIds: newSpaceIds },
            {
              where: {
                id: conversation.id,
                workspaceId: conversation.workspaceId,
              },
              hooks: false,
              silent: true,
            }
          );
          updatedCount++;
        } catch (error) {
          logger.error(
            {
              conversationSid: conversation.sId,
              error: error instanceof Error ? error.message : String(error),
            },
            "Failed to update conversation"
          );
          errorCount++;
        }
      } else {
        updatedCount++;
      }
    }

    logger.info(
      {
        total: affected.length,
        updated: updatedCount,
        errors: errorCount,
        execute,
      },
      execute
        ? `Done: updated ${updatedCount} conversation(s)`
        : `Dry run: would update ${updatedCount} conversation(s)`
    );
  }
);
