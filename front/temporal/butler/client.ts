import type { AuthenticatorType } from "@app/lib/auth";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/butler/config";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { butlerCompleteSignal, butlerRefreshSignal } from "./signals";
import { butlerWorkflow } from "./workflows";

function makeButlerWorkflowId(
  workspaceId: string,
  conversationId: string
): string {
  return `butler-${workspaceId}-${conversationId}`;
}

export async function launchOrSignalButlerWorkflow({
  authType,
  conversationId,
  messageId,
}: {
  authType: AuthenticatorType;
  conversationId: string;
  messageId: string;
}): Promise<Result<undefined, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = makeButlerWorkflowId(authType.workspaceId, conversationId);

  try {
    await client.workflow.signalWithStart(butlerWorkflow, {
      args: [{ authType, conversationId, messageId }],
      taskQueue: QUEUE_NAME,
      workflowId,
      signal: butlerRefreshSignal,
      signalArgs: [messageId],
      workflowExecutionTimeout: "1 hour",
      memo: {
        workspaceId: authType.workspaceId,
        conversationId,
        messageId,
      },
    });
    return new Ok(undefined);
  } catch (e) {
    logger.error(
      {
        workflowId,
        workspaceId: authType.workspaceId,
        conversationId,
        messageId,
        error: e,
      },
      "Failed starting butler workflow"
    );

    return new Err(normalizeError(e));
  }
}

export async function signalButlerComplete({
  authType,
  conversationId,
  messageId,
}: {
  authType: AuthenticatorType;
  conversationId: string;
  messageId: string;
}): Promise<void> {
  try {
    const client = await getTemporalClientForFrontNamespace();
    const workflowId = makeButlerWorkflowId(
      authType.workspaceId,
      conversationId
    );
    await client.workflow
      .getHandle(workflowId)
      .signal(butlerCompleteSignal, messageId);
  } catch (e) {
    // Swallow errors — workflow may have already completed or timed out.
    logger.warn(
      {
        conversationId,
        error: normalizeError(e),
      },
      "Failed signaling butler complete (workflow may have already finished)"
    );
  }
}
