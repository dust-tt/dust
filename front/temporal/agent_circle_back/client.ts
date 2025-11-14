import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

import { QUEUE_NAME } from "./config";
import { agentCircleBackWorkflow } from "./workflows";

export async function launchAgentCircleBackWorkflow({
  workspaceId,
  conversationId,
  agentConfigurationId,
  userId,
  message,
  delayMs,
}: {
  workspaceId: string;
  conversationId: string;
  agentConfigurationId: string;
  userId: string;
  message: string;
  delayMs: number;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClientForFrontNamespace();

  // Create a unique workflow ID using workspace, conversation, and timestamp
  const workflowId = `agent-circle-back-${workspaceId}-${conversationId}-${Date.now()}`;

  try {
    await client.workflow.start(agentCircleBackWorkflow, {
      args: [
        workspaceId,
        conversationId,
        agentConfigurationId,
        userId,
        message,
        delayMs,
      ],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
      memo: {
        workspaceId,
        conversationId,
        agentConfigurationId,
        userId,
        delayMs,
      },
    });

    logger.info(
      {
        workflowId,
        workspaceId,
        conversationId,
        delayMs,
      },
      "[CircleBack] Started agent circle back workflow."
    );

    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workflowId,
        workspaceId,
        conversationId,
        error: e,
      },
      "[CircleBack] Failed starting agent circle back workflow."
    );

    return new Err(normalizeError(e));
  }
}
