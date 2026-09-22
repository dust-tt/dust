import { indexAgentMessageConsumptionAnalytics } from "@app/lib/analytics/agent_message_consumption";
import { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";

/**
 * Backfills the consumption-analytics ES index for agent messages currently paused at the credit
 * spend checkpoint (status "created", creditSpendCheckpointStatus "paused"). Before the fix in
 * `front/lib/analytics/agent_message_consumption/load.ts`, their one-shot indexing attempt at
 * pause time was silently skipped because the loader required a terminal status. Once resolved
 * (acknowledged or stopped), these messages self-heal through the normal indexing path; this
 * backfill only targets messages still stuck paused right now.
 *
 * Idempotent: indexing is an upsert keyed by message id and consumption unit.
 *
 * Pass `--wId <workspaceId>` to run on a single workspace.
 */
makeScript(
  {
    wId: {
      type: "string",
      required: false,
      description: "Run on a single workspace (sId).",
    },
  },
  async ({ execute, wId }, logger) => {
    let indexed = 0;
    let failed = 0;

    await runOnAllWorkspaces(
      async (workspace) => {
        const messages = await MessageModel.findAll({
          where: { workspaceId: workspace.id },
          include: [
            {
              model: AgentMessageModel,
              as: "agentMessage",
              required: true,
              where: {
                workspaceId: workspace.id,
                status: "created",
                creditSpendCheckpointStatus: "paused",
              },
            },
          ],
        });
        if (messages.length === 0) {
          return;
        }

        const auth = await Authenticator.internalAdminForWorkspace(
          workspace.sId
        );

        await concurrentExecutor(
          messages,
          async (message) => {
            logger.info(
              { workspaceId: workspace.sId, agentMessageId: message.sId },
              execute
                ? "Indexing paused checkpoint message."
                : "Would index paused checkpoint message."
            );
            if (!execute) {
              return;
            }

            const result = await indexAgentMessageConsumptionAnalytics(auth, {
              agentMessageId: message.sId,
            });
            if (result.isErr()) {
              logger.error(
                {
                  workspaceId: workspace.sId,
                  agentMessageId: message.sId,
                  error: result.error,
                },
                "Failed to index paused checkpoint message."
              );
              failed++;
              return;
            }
            indexed++;
          },
          { concurrency: 4 }
        );
      },
      { wId }
    );

    logger.info(
      { indexed, failed },
      execute ? "Backfill completed." : "Dry run completed."
    );
  }
);
