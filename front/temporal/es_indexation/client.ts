import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/es_indexation/config";
import {
  makeIndexConversationEsWorkflowId,
  makeIndexUserSearchWorkflowId,
} from "@app/temporal/es_indexation/helpers";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

import { indexConversationEsSignal, indexUserSearchSignal } from "./signals";
import {
  indexConversationEsWorkflow,
  indexUserSearchWorkflow,
} from "./workflows";

export async function launchIndexUserSearchWorkflow({
  userId,
}: {
  userId: string;
}): Promise<Result<undefined, Error>> {
  const client = await getTemporalClientForFrontNamespace();

  const workflowId = makeIndexUserSearchWorkflowId({ userId });

  try {
    await client.workflow.signalWithStart(indexUserSearchWorkflow, {
      args: [{ userId }],
      taskQueue: QUEUE_NAME,
      workflowId,
      signal: indexUserSearchSignal,
      signalArgs: undefined,
      memo: {
        userId,
      },
    });
    return new Ok(undefined);
  } catch (e) {
    logger.error(
      {
        workflowId,
        userId,
        error: e,
      },
      "Failed starting index user workflow"
    );

    return new Err(normalizeError(e));
  }
}

export async function launchIndexConversationEsWorkflow({
  conversationId,
  workspaceId,
}: {
  conversationId: string;
  workspaceId: string;
}): Promise<Result<undefined, Error>> {
  const client = await getTemporalClientForFrontNamespace();

  const workflowId = makeIndexConversationEsWorkflowId({
    workspaceId,
    conversationId,
  });

  try {
    await client.workflow.signalWithStart(indexConversationEsWorkflow, {
      args: [{ conversationId, workspaceId }],
      taskQueue: QUEUE_NAME,
      workflowId,
      signal: indexConversationEsSignal,
      signalArgs: undefined,
      memo: {
        conversationId,
        workspaceId,
      },
    });

    return new Ok(undefined);
  } catch (e) {
    logger.error(
      {
        workflowId,
        conversationId,
        workspaceId,
        error: e,
      },
      "[conversation_search] Failed to signal conversation ES indexing workflow"
    );

    return new Err(normalizeError(e));
  }
}
