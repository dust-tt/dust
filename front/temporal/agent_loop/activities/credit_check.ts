import type { CreditCheckResult } from "@app/lib/api/assistant/credit_check";
import {
  checkPoolCreditGate,
  checkWorkflowAlertThresholdGate,
} from "@app/lib/api/assistant/credit_check";
import { publishConversationRelatedEvent } from "@app/lib/api/assistant/streaming/events";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import type { AgentLoopArgsWithTiming } from "@app/types/assistant/agent_run";
import {
  getAgentLoopData,
  isAgentLoopDataSoftDeleteError,
} from "@app/types/assistant/agent_run";
import { normalizeError } from "@app/types/shared/utils/error_utils";
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

// Spend only grows, so once the user has confirmed continuing past the threshold for this
// message, every later run (including ones relaunched by continuing) would otherwise cross it
// again on the very first step and pause right back. This is a single-row lookup, not the full
// conversation fetch the crossed path below does.
async function hasAcknowledgedWorkflowAlertThreshold(
  auth: Authenticator,
  { agentMessageId }: { agentMessageId: string }
): Promise<boolean> {
  const message = await MessageModel.findOne({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      sId: agentMessageId,
    },
    attributes: ["id"],
    include: [
      {
        model: AgentMessageModel,
        as: "agentMessage",
        required: true,
        attributes: ["workflowAlertThresholdStatus"],
      },
    ],
  });

  return message?.agentMessage?.workflowAlertThresholdStatus === "acknowledged";
}

/**
 * Cheap per-step check (no conversation fetch): does the current user's spend cross their
 * workflow alert threshold? Only on the step it first crosses does this load the conversation
 * and publish a notification event — the workflow guards against calling this again for the
 * same message once it returns `crossed: true`, so the heavier fetch happens at most once.
 *
 * Returns `acknowledged: true` once, the first time it observes the durable "acknowledged" flag,
 * so the workflow can stop calling this activity (and reading that flag) for the rest of the
 * execution: acknowledgment can't change mid-execution, since the only way to set it requires a
 * pause, which requires this execution to have already exited.
 */
export async function checkWorkflowAlertThresholdActivity(
  authType: AuthenticatorType,
  { agentLoopArgs }: { agentLoopArgs: AgentLoopArgsWithTiming }
): Promise<{ crossed: boolean; acknowledged: boolean }> {
  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);

  if (
    await hasAcknowledgedWorkflowAlertThreshold(auth, {
      agentMessageId: agentLoopArgs.agentMessageId,
    })
  ) {
    return { crossed: false, acknowledged: true };
  }

  const result = await checkWorkflowAlertThresholdGate(auth);
  if (!result.crossed) {
    return { crossed: false, acknowledged: false };
  }

  const runAgentDataRes = await getAgentLoopData(authType, agentLoopArgs);
  if (runAgentDataRes.isErr()) {
    if (isAgentLoopDataSoftDeleteError(runAgentDataRes.error)) {
      return { crossed: true, acknowledged: false };
    }
    throw normalizeError(runAgentDataRes.error);
  }
  const { agentConfiguration, agentMessage, conversation } =
    runAgentDataRes.value;

  const step = maxBy(agentMessage.contents, "step")?.step ?? 0;

  // Persisted here (rather than in a dedicated finalize step) so it survives a refresh: the
  // workflow just falls through to the ordinary success finalize path when it breaks the loop,
  // exactly like a blocked tool action's `needsApproval` exit — the durable "paused" marker is
  // this activity's job, the same way a blocked action's status is set when it's first created.
  // The step to resume at is not stored here: like every other resume path, it's derived from the
  // message's own agentStepContents rows when the pause is resolved.
  await AgentMessageModel.update(
    {
      workflowAlertThresholdStatus: "paused",
    },
    {
      where: {
        id: agentMessage.agentMessageId,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    }
  );

  try {
    await ConversationResource.markAsActionRequired(auth, { conversation });

    await publishConversationRelatedEvent({
      conversationId: conversation.sId,
      step,
      event: {
        type: "agent_credit_alert_threshold_crossed",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        thresholdAwuCredits: result.thresholdAwuCredits,
      },
    });
  } catch (err) {
    logger.error(
      {
        conversationId: agentLoopArgs.conversationId,
        agentMessageId: agentLoopArgs.agentMessageId,
        error: normalizeError(err),
      },
      "[WorkflowAlertThreshold] Failed to notify after persisting pause"
    );
  }

  return { crossed: true, acknowledged: false };
}
