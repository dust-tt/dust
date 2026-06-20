import { checkPoolCreditGate } from "@app/lib/api/assistant/credit_check";
import type { AuthenticatorType } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { updateResourceAndPublishEvent } from "@app/temporal/agent_loop/activities/common";
import type { AgentLoopArgsWithTiming } from "@app/types/assistant/agent_run";
import {
  getAgentLoopData,
  isAgentLoopDataSoftDeleteError,
} from "@app/types/assistant/agent_run";

const CREDITS_EXHAUSTED_ERROR_TITLE = "Workspace out of credits";
const CREDITS_EXHAUSTED_ERROR_MESSAGE_ADMIN =
  "Your workspace has run out of credits. Please purchase more credits to continue using Dust.";
const CREDITS_EXHAUSTED_ERROR_MESSAGE_MEMBER =
  "Your workspace has run out of credits. Please contact your administrator to purchase more credits.";

// Stage 1: stops the loop as a retryable failure (not a resumable pause). Retrying re-runs the
// message from scratch; this is a deliberate interim ahead of the resumable-pause design.
// TODO
export async function checkCreditsActivity(
  authType: AuthenticatorType,
  {
    agentLoopArgs,
    runIds,
    step,
  }: {
    agentLoopArgs: AgentLoopArgsWithTiming;
    runIds: string[];
    step: number;
  }
): Promise<{ shouldStop: boolean }> {
  const runAgentDataRes = await getAgentLoopData(authType, agentLoopArgs);
  if (runAgentDataRes.isErr()) {
    if (isAgentLoopDataSoftDeleteError(runAgentDataRes.error)) {
      // Conversation or message was soft-deleted mid-loop: nothing to stop here, other paths
      // already handle winding the workflow down.
      return { shouldStop: false };
    }
    throw runAgentDataRes.error;
  }

  const { auth, agentConfiguration, agentMessage, conversation } =
    runAgentDataRes.value;

  const result = await checkPoolCreditGate(auth, {
    agentMessageId: agentMessage.sId,
    runIds,
  });
  if (!result.shouldStop) {
    return { shouldStop: false };
  }

  logger.info(
    {
      workspaceId: auth.getNonNullableWorkspace().sId,
      agentMessageId: agentMessage.sId,
      runIds,
      reason: result.reason,
    },
    "[CreditCheck] stopping agent loop: workspace credit pool exhausted"
  );

  const creditsExhaustedErrorMessage = auth.isAdmin()
    ? CREDITS_EXHAUSTED_ERROR_MESSAGE_ADMIN
    : CREDITS_EXHAUSTED_ERROR_MESSAGE_MEMBER;

  await updateResourceAndPublishEvent(auth, {
    event: {
      type: "agent_error",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      error: {
        code: result.reason,
        message: creditsExhaustedErrorMessage,
        metadata: {
          category: result.reason,
          errorTitle: CREDITS_EXHAUSTED_ERROR_TITLE,
        },
      },
      runIds,
    },
    agentMessage,
    conversation,
    step,
  });

  return { shouldStop: true };
}
