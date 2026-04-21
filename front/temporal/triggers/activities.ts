import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import {
  createConversation,
  postNewContentFragment,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import { Authenticator } from "@app/lib/auth";
import { serializeMention } from "@app/lib/mentions/format";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import { getTemporalClientForAgentNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { makeTriggerScheduleId } from "@app/temporal/triggers/schedule_client";
import type { ContentFragmentInputWithFileIdType } from "@app/types/api/internal/assistant";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { TriggerType } from "@app/types/assistant/triggers";
import type { APIErrorWithStatusCode } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

class TriggerNonRetryableError extends Error {}

// biome-ignore lint/correctness/noUnusedVariables: not implemented yet.
class WakeUpNonRetryableError extends Error {}

async function createConversationForAgentConfiguration({
  auth,
  agentConfiguration,
  trigger,
  lastRunAt,
  contentFragment,
}: {
  auth: Authenticator;
  agentConfiguration: AgentConfigurationType;
  trigger: TriggerType;
  lastRunAt: Date | null;
  contentFragment?: ContentFragmentInputWithFileIdType;
}): Promise<Result<ConversationType, APIErrorWithStatusCode>> {
  const newConversation = await createConversation(auth, {
    title: null,
    visibility: "unlisted",
    triggerId: trigger.id,
    spaceId: null,
  });

  const baseContext = {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
    username: auth.getNonNullableUser().username,
    fullName: auth.getNonNullableUser().fullName(),
    email: auth.getNonNullableUser().email,
    profilePictureUrl: null,
    origin:
      trigger.kind === "webhook" && trigger.executionMode === "programmatic"
        ? ("triggered_programmatic" as const)
        : ("triggered" as const),
    lastTriggerRunAt: lastRunAt?.getTime() ?? null,
  };

  if (contentFragment) {
    await postNewContentFragment(auth, newConversation, contentFragment, null);
  }

  const messageRes = await postUserMessage(auth, {
    conversation: newConversation,
    content:
      serializeMention(agentConfiguration) +
      (trigger.customPrompt ? `\n\n${trigger.customPrompt}` : ""),
    mentions: [{ configurationId: agentConfiguration.sId }],
    context: baseContext,
    skipToolsValidation: false,
  });

  if (messageRes.isErr()) {
    logger.error(
      {
        agentConfigurationId: trigger.agentConfigurationId,
        conversationId: newConversation.sId,
        error: messageRes.error,
        triggerId: trigger.sId,
        workspaceId: auth.workspace()?.sId,
      },
      "scheduledAgentCallActivity: Error sending message."
    );
    return messageRes;
  }

  return new Ok(newConversation);
}

export async function runTriggeredAgentsActivity({
  userId,
  workspaceId,
  triggerId,
  contentFragment,
  webhookRequestId,
}: {
  userId: string;
  workspaceId: string;
  triggerId: string;
  contentFragment?: ContentFragmentInputWithFileIdType;
  webhookRequestId?: number;
}) {
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    userId,
    workspaceId
  );

  if (!auth.workspace() || !auth.user()) {
    throw new TriggerNonRetryableError(
      "Invalid authentication. Missing workspaceId or userId."
    );
  }

  if (!auth.isUser()) {
    throw new TriggerNonRetryableError(
      "Invalid authentication. Missing user permissions."
    );
  }

  const triggerResource = await TriggerResource.fetchById(auth, triggerId);
  if (!triggerResource) {
    throw new TriggerNonRetryableError(
      `Trigger with ID ${triggerId} not found.`
    );
  }

  const trigger = triggerResource.toJSON();

  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: trigger.agentConfigurationId,
    variant: "full",
  });

  if (!agentConfiguration) {
    logger.info(
      {
        triggerId: trigger.sId,
        agentConfigurationId: trigger.agentConfigurationId,
        workspaceId: auth.workspace()?.sId,
      },
      "Disabling trigger: agent configuration not found."
    );
    await triggerResource.disable(auth);
    throw new TriggerNonRetryableError(
      `Agent configuration with ID ${trigger.agentConfigurationId} not found in workspace ${auth.getNonNullableWorkspace().id}.`
    );
  }

  void emitAuditLogEvent({
    auth,
    action: "trigger.fired",
    targets: [
      buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      buildAuditLogTarget("trigger", {
        sId: trigger.sId,
        name: trigger.name ?? trigger.sId,
      }),
    ],
    metadata: {
      triggerType: trigger.kind,
      agentId: trigger.agentConfigurationId,
      initiating_user_id: auth.user()?.sId ?? "unknown",
      initiating_user_email: auth.user()?.email ?? "unknown",
    },
  });

  if (triggerResource.status !== "enabled") {
    logger.info({ triggerId: trigger.sId }, "Trigger is disabled.");
    return;
  }

  let lastRunAt: Date | null = null;
  switch (trigger.kind) {
    case "schedule": {
      const client = await getTemporalClientForAgentNamespace();
      const scheduleId = makeTriggerScheduleId(
        auth.getNonNullableWorkspace().sId,
        trigger.sId
      );

      try {
        const handle = client.schedule.getHandle(scheduleId);
        const schedule = await handle.describe();

        const recentActions = schedule.info.recentActions;
        lastRunAt =
          recentActions.length > 0
            ? recentActions[recentActions.length - 2].takenAt // -2 to get the last completed action, -1 is the current running action
            : null;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        // biome-ignore lint/correctness/noUnusedVariables: ignored using `--suppress`
      } catch (error) {
        // We can ignore this error, schedule might not have run yet.
      }
      break;
    }

    case "webhook": {
      break;
    }

    default: {
      assertNever(trigger);
    }
  }

  // Create a single conversation for the editor.
  const conversationResult = await createConversationForAgentConfiguration({
    auth,
    agentConfiguration,
    trigger,
    lastRunAt,
    contentFragment,
  });
  if (conversationResult.isErr()) {
    const { type: errorType, message: errorMessage } =
      conversationResult.error.api_error;
    const isNonRetryable =
      errorType === "plan_message_limit_exceeded" ||
      errorType === "model_disabled" ||
      errorType === "invalid_request_error" ||
      errorType === "agent_inaccessible";

    if (isNonRetryable) {
      // If the agent is inaccessible, disable the trigger.
      if (errorType === "agent_inaccessible") {
        logger.info(
          {
            triggerId: trigger.sId,
            agentConfigurationId: trigger.agentConfigurationId,
            workspaceId: auth.workspace()?.sId,
          },
          "Disabling trigger: agent is inaccessible."
        );
        await triggerResource.disable(auth);
      }

      if (webhookRequestId && trigger.kind === "webhook") {
        const webhookRequest =
          await WebhookRequestResource.fetchByModelIdWithAuth(
            auth,
            webhookRequestId
          );
        if (webhookRequest) {
          await webhookRequest.markRelatedTrigger({
            trigger,
            status: "workflow_start_failed",
            errorMessage,
          });
        }
      }
      // Return without throwing, this is normal behaviour so we don't want an error
      return;
    }

    throw new Error(`Error creating conversation: ${errorMessage}`, {
      cause: conversationResult.error,
    });
  }
}

export async function runWakeUpActivity({
  workspaceId,
  wakeUpId,
}: {
  workspaceId: string;
  wakeUpId: string;
}): Promise<void> {
  logger.info(
    { wakeUpId, workspaceId },
    "Wake-up activity is not implemented yet."
  );
}
