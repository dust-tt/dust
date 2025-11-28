import { Op } from "sequelize";

import { AgentMCPActionModel } from "@app/lib/models/agent/actions/mcp";
import { AgentMessage } from "@app/lib/models/agent/conversation";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { markAgentMessageAsFailed } from "@app/temporal/agent_loop/activities/common";

const BATCH_SIZE = 200;

async function processBlockedAuthAgentMessages(
  execute: boolean,
  logger: typeof Logger
) {
  let lastId = 0;
  let hasMore = true;
  let totalProcessed = 0;

  while (hasMore) {
    // Find agent_mcp_actions with blocked_authentication_required status
    const blockedMcpActions = await AgentMCPActionModel.findAll({
      where: {
        status: "blocked_authentication_required",
        id: { [Op.gt]: lastId },
      },
      limit: BATCH_SIZE,
      order: [["id", "ASC"]],
      attributes: ["id", "agentMessageId"],
    });

    if (blockedMcpActions.length === 0) {
      logger.info("No more blocked MCP actions found");
      break;
    }

    logger.info(
      { count: blockedMcpActions.length, lastId },
      "Found blocked MCP actions"
    );

    // Get unique agent message IDs
    const agentMessageIds = [
      ...new Set(blockedMcpActions.map((action) => action.agentMessageId)),
    ];

    // Find agent messages with status "created"
    const agentMessages = await AgentMessage.findAll({
      where: {
        id: { [Op.in]: agentMessageIds },
        status: "created",
      },
    });

    logger.info(
      {
        mcpActionsCount: blockedMcpActions.length,
        agentMessagesCount: agentMessages.length,
      },
      "Found agent messages to process"
    );

    // Process each agent message
    for (const agentMessage of agentMessages) {
      if (execute) {
        await markAgentMessageAsFailed(agentMessage, {
          code: "personal_authentication_required",
          message:
            "Agent message failed due to missing personal authentication.",
          metadata: {
            category: "migration",
            reason: "blocked_authentication_required_cleanup",
            migrationDate: new Date().toISOString(),
          },
        });

        logger.info(
          {
            agentMessageId: agentMessage.id,
            workspaceId: agentMessage.workspaceId,
          },
          "Marked agent message as failed"
        );
      } else {
        logger.info(
          {
            agentMessageId: agentMessage.id,
            workspaceId: agentMessage.workspaceId,
          },
          "Would mark agent message as failed (dry run)"
        );
      }

      totalProcessed++;
    }

    hasMore = blockedMcpActions.length === BATCH_SIZE;
    lastId = blockedMcpActions[blockedMcpActions.length - 1].id;
  }

  logger.info(
    { totalProcessed },
    "Finished processing blocked authentication agent messages"
  );
}

makeScript({}, async ({ execute }, logger) => {
  logger.info(
    "Starting migration to mark blocked authentication agent messages as failed"
  );

  await processBlockedAuthAgentMessages(execute, logger);

  logger.info(
    "Completed migration to mark blocked authentication agent messages as failed"
  );
});
