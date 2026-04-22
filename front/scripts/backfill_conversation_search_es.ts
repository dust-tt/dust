import { ConversationModel } from "@app/lib/models/agent/conversation";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { launchIndexConversationEsWorkflow } from "@app/temporal/es_indexation/client";
import type { ModelId } from "@app/types/shared/model_id";
import { Op, type WhereOptions } from "sequelize";

import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

const BATCH_SIZE = 500;

makeScript(
  {
    wId: {
      type: "string",
      describe: "Workspace sId to backfill (omit to run on all workspaces)",
    },
    fromWorkspaceModelId: {
      type: "number",
      describe: "Skip workspaces with model id below this value (for resuming)",
    },
    fromConversationModelId: {
      type: "number",
      describe:
        "Skip conversations with model id below this value (for resuming within a workspace)",
    },
    batchSize: {
      type: "number",
      default: BATCH_SIZE,
      describe: "Number of conversations to fetch per DB query",
    },
    concurrency: {
      type: "number",
      default: 10,
      describe: "Concurrent Temporal signalWithStart calls per batch",
    },
  },
  async (
    {
      execute,
      wId,
      fromWorkspaceModelId,
      fromConversationModelId,
      batchSize,
      concurrency,
    },
    logger
  ) => {
    await runOnAllWorkspaces(
      async (workspace) => {
        const { sId: workspaceId, id: workspaceModelId } = workspace;

        logger.info(
          { workspaceId, workspaceModelId, execute },
          "[backfill_conversation_search] Starting workspace"
        );

        let lastId: ModelId | null = fromConversationModelId ?? null;
        let totalTriggered = 0;

        while (true) {
          const whereClause: WhereOptions<ConversationModel> = {
            workspaceId: workspaceModelId,
            // Only index non-deleted conversations. The activity handles soft-deleted ones.
            visibility: { [Op.ne]: "deleted" },
          };

          if (lastId !== null) {
            whereClause.id = { [Op.gt]: lastId };
          }

          const conversations = await ConversationModel.findAll({
            attributes: ["id", "sId"],
            where: whereClause,
            order: [["id", "ASC"]],
            limit: batchSize,
            raw: true,
          });

          if (conversations.length === 0) {
            break;
          }

          lastId = conversations[conversations.length - 1].id;

          if (execute) {
            await concurrentExecutor(
              conversations,
              async (conv) => {
                const result = await launchIndexConversationEsWorkflow({
                  conversationId: conv.sId,
                  workspaceId,
                });
                if (result.isErr()) {
                  logger.error(
                    {
                      conversationId: conv.sId,
                      workspaceId,
                      error: result.error,
                    },
                    "[backfill_conversation_search] Failed to trigger workflow"
                  );
                }
              },
              { concurrency }
            );
          }

          totalTriggered += conversations.length;
          logger.info(
            { workspaceId, lastId, totalTriggered, execute },
            execute
              ? "[backfill_conversation_search] Triggered batch"
              : "[backfill_conversation_search] [DRY RUN] Would trigger batch"
          );
        }

        logger.info(
          { workspaceId, totalTriggered, execute },
          "[backfill_conversation_search] Completed workspace"
        );
      },
      { wId, fromWorkspaceId: fromWorkspaceModelId }
    );

    logger.info("[backfill_conversation_search] Done.");
  }
);
