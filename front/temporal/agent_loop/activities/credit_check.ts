import type { CreditCheckResult } from "@app/lib/api/assistant/credit_check";
import {
  checkPoolCreditGate,
  checkWorkflowAlertThresholdGate,
} from "@app/lib/api/assistant/credit_check";
import { publishConversationRelatedEvent } from "@app/lib/api/assistant/streaming/events";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { AgentLoopArgsWithTiming } from "@app/types/assistant/agent_run";
import {
  getAgentLoopData,
  isAgentLoopDataSoftDeleteError,
} from "@app/types/assistant/agent_run";
import maxBy from "lodash/maxBy";

export async function checkCreditsActivity(
  authType: AuthenticatorType,
  { agentLoopArgs }: { agentLoopArgs: AgentLoopArgsWithTiming }
): Promise<CreditCheckResult> {
  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);

  return checkPoolCreditGate(auth, {
    userMessageOrigin: agentLoopArgs.userMessageOrigin ?? null,
  });
}

/**
 * Cheap per-step check (no conversation fetch): does the current user's spend cross their
 * workflow alert threshold? Only on the step it first crosses does this load the conversation
 * and publish a notification event — the workflow guards against calling this again for the
 * same message once it returns `crossed: true`, so the heavier fetch happens at most once.
 */
export async function checkWorkflowAlertThresholdActivity(
  authType: AuthenticatorType,
  { agentLoopArgs }: { agentLoopArgs: AgentLoopArgsWithTiming }
): Promise<{ crossed: boolean }> {
  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);

  const result = await checkWorkflowAlertThresholdGate(auth);
  if (!result.crossed) {
    return { crossed: false };
  }

  const runAgentDataRes = await getAgentLoopData(authType, agentLoopArgs);
  if (runAgentDataRes.isErr()) {
    if (isAgentLoopDataSoftDeleteError(runAgentDataRes.error)) {
      return { crossed: true };
    }
    logger.error(
      {
        conversationId: agentLoopArgs.conversationId,
        agentMessageId: agentLoopArgs.agentMessageId,
        error: runAgentDataRes.error,
      },
      "[WorkflowAlertThreshold] Failed to load agent loop data; skipping notification"
    );
    return { crossed: true };
  }
  const { agentConfiguration, agentMessage, conversation } =
    runAgentDataRes.value;

  const step = maxBy(agentMessage.contents, "step")?.step ?? 0;

  await publishConversationRelatedEvent({
    conversationId: conversation.sId,
    step,
    event: {
      type: "agent_workflow_alert_threshold_crossed",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      thresholdAwuCredits: result.thresholdAwuCredits,
    },
  });

  return { crossed: true };
}
