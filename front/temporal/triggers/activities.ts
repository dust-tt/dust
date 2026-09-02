import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import {
  createConversation,
  postNewContentFragment,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import { toFileContentFragment } from "@app/lib/api/assistant/conversation/content_fragment";
import { resolvedModelFromUserMessageRow } from "@app/lib/api/assistant/models";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import { Authenticator } from "@app/lib/auth";
import { serializeMention } from "@app/lib/mentions/format";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { WakeUpResource } from "@app/lib/resources/wakeup_resource";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import { getTemporalClientForAgentNamespace } from "@app/lib/temporal";
import { PostHogServerSideTracking } from "@app/lib/tracking/posthog/server";
import { getWebhookRequestPayloadFromGCS } from "@app/lib/triggers/webhook";
import logger from "@app/logger/logger";
import { makeTriggerScheduleId } from "@app/temporal/triggers/schedule_client";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type {
  ConversationWithoutContentType,
  UserMessageContext,
} from "@app/types/assistant/conversation";
import type { TriggerType } from "@app/types/assistant/triggers";
import type { WakeUpType } from "@app/types/assistant/wakeups";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";

async function createConversationForAgentConfiguration({
  auth,
  agentConfiguration,
  trigger,
  lastRunAt,
  webhookRequest,
}: {
  auth: Authenticator;
  agentConfiguration: AgentConfigurationType;
  trigger: TriggerType;
  lastRunAt: Date | null;
  webhookRequest: WebhookRequestResource | null;
}): Promise<
  Result<ConversationWithoutContentType, APIErrorWithContentfulStatusCode>
> {
  let spaceModelId: ModelId | null = null;
  if (trigger.spaceId) {
    const pod = await SpaceResource.fetchById(auth, trigger.spaceId);
    if (pod && pod.isProject() && pod.canRead(auth)) {
      spaceModelId = pod.id;
    } else {
      logger.warn(
        { triggerId: trigger.sId, spaceId: trigger.spaceId },
        "Trigger's pod is no longer accessible; falling back to default (my conversations)."
      );
    }
  }

  const newConversation = await createConversation(auth, {
    title: null,
    visibility: "unlisted",
    triggerId: trigger.id,
    spaceId: spaceModelId,
  });

  const triggeredContext: UserMessageContext = {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
    username: auth.getNonNullableUser().username,
    fullName: auth.getNonNullableUser().fullName(),
    email: auth.getNonNullableUser().email,
    profilePictureUrl: null,
    origin:
      trigger.executionMode === "workspace_pool"
        ? "triggered_programmatic"
        : "triggered",
    lastTriggerRunAt: lastRunAt?.getTime() ?? null,
  };

  if (
    webhookRequest &&
    trigger.kind === "webhook" &&
    trigger.configuration.includePayload
  ) {
    // If we need the payload, create a content fragment for it.
    const payloadRes = await getWebhookRequestPayloadFromGCS(auth, {
      webhookRequest,
    });
    if (payloadRes.isErr()) {
      logger.error(
        {
          triggerId: trigger.sId,
          error: payloadRes.error,
        },
        "Error getting webhook request payload from GCS."
      );
      return new Err({
        api_error: {
          type: "webhook_storage_error",
          message: "Webhook request payload not found.",
        },
        status_code: 500,
      });
    }

    const contentFragmentRes = await toFileContentFragment(auth, {
      conversation: newConversation,
      contentFragment: {
        contentType: "application/json",
        content: JSON.stringify(payloadRes.value.body, null, 2),
        title: `Webhook body (source id: ${webhookRequest.webhookSourceId}, date: ${new Date().toISOString()})`,
      },
      fileName: `webhook_body_${webhookRequest.webhookSourceId}_${Date.now()}.json`,
    });

    if (contentFragmentRes.isErr()) {
      const errorMessage =
        "Error creating file content fragment from webhook request.";
      await webhookRequest.markAsFailed(errorMessage);
      logger.error(
        {
          workspaceId: auth.workspace()?.sId,
          webhookRequestId: webhookRequest.id,
        },
        errorMessage
      );
      return new Err({
        api_error: {
          type: "webhook_storage_error",
          message: "Error creating file content fragment from webhook request.",
        },
        status_code: 500,
      });
    }

    await postNewContentFragment(
      auth,
      newConversation.toJSON(),
      contentFragmentRes.value,
      null
    );
  }

  const messageRes = await postUserMessage(auth, {
    conversationResource: newConversation,
    content:
      serializeMention(agentConfiguration) +
      (trigger.customPrompt ? `\n\n${trigger.customPrompt}` : ""),
    mentions: [{ configurationId: agentConfiguration.sId }],
    context: triggeredContext,
    skipToolsValidation: false,
  });

  if (messageRes.isErr()) {
    const { type: errorType } = messageRes.error.api_error;
    if (
      errorType === "plan_message_limit_exceeded" ||
      errorType === "credits_exhausted" ||
      errorType === "user_cap_reached" ||
      errorType === "rate_limit_error" ||
      errorType === "no_seat"
    ) {
      PostHogServerSideTracking.trackEvent({
        distinctId: auth.getNonNullableUser().sId,
        event: "trigger_blocked",
        properties: {
          workspace_id: auth.getNonNullableWorkspace().sId,
          trigger_id: trigger.sId,
          error_type: errorType,
        },
      });
    }

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

  return new Ok(newConversation.toJSON());
}

export async function runTriggeredAgentsActivity({
  userId,
  workspaceId,
  triggerId,
  webhookRequestId,
}: {
  userId: string;
  workspaceId: string;
  triggerId: string;
  webhookRequestId?: number;
}) {
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    userId,
    workspaceId
  );

  // Expected terminal states (workspace, user, trigger or agent gone by the
  // time the schedule or webhook fires): there is nothing left to run, so the
  // activity logs and returns instead of failing the workflow.
  if (!auth.workspace() || !auth.user()) {
    logger.info(
      { triggerId, userId, workspaceId },
      "Invalid authentication. Missing workspaceId or userId."
    );
    return;
  }

  if (!auth.isUser()) {
    logger.info(
      { triggerId, userId, workspaceId },
      "Invalid authentication. Missing user permissions."
    );
    return;
  }

  const triggerResource = await TriggerResource.fetchById(auth, triggerId);
  if (!triggerResource) {
    logger.info(
      { triggerId, workspaceId },
      `Trigger with ID ${triggerId} not found.`
    );
    return;
  }

  const trigger = triggerResource.toJSON();

  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: trigger.agentConfigurationId,
    variant: "extra_light",
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
    return;
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
      trigger_type: trigger.kind,
      agent_id: trigger.agentConfigurationId,
      initiating_user_id: auth.user()?.sId ?? "unknown",
      initiating_user_email: auth.user()?.email ?? "unknown",
    },
  });

  if (triggerResource.status !== "enabled") {
    logger.info({ triggerId: trigger.sId }, "Trigger is disabled.");
    return;
  }

  let lastRunAt: Date | null = null;
  let webhookRequest: WebhookRequestResource | null = null;
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
      if (webhookRequestId) {
        webhookRequest = await WebhookRequestResource.fetchByModelIdWithAuth(
          auth,
          webhookRequestId
        );
      }
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
    webhookRequest,
  });
  if (conversationResult.isErr()) {
    const { type: errorType, message: errorMessage } =
      conversationResult.error.api_error;
    const isNonRetryable =
      errorType === "plan_message_limit_exceeded" ||
      errorType === "credits_exhausted" ||
      errorType === "user_cap_reached" ||
      errorType === "model_disabled" ||
      errorType === "invalid_request_error" ||
      errorType === "agent_inaccessible" ||
      errorType === "webhook_storage_error" ||
      errorType === "no_seat";

    if (isNonRetryable) {
      logger.info(
        {
          triggerId: trigger.sId,
          agentConfigurationId: trigger.agentConfigurationId,
          workspaceId: auth.workspace()?.sId,
          errorType,
        },
        "Trigger run completed without creating a conversation."
      );

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

      if (webhookRequest) {
        await webhookRequest.markRelatedTrigger({
          trigger,
          status: "workflow_start_failed",
          errorMessage,
        });
      }
      // Return without throwing, this is normal behaviour so we don't want an error
      return;
    }

    throw new Error(`Error creating conversation: ${errorMessage}`, {
      cause: conversationResult.error,
    });
  }
}

function buildWakeUpMessageContent(wakeUp: WakeUpType): string {
  let content: string = "";

  content = `<dust_system>\n`;
  content += `This is an automatic wake-up message for a previously scheduled follow-up using the wake-up tool.\n`;
  content += `- Wake-up ID: ${wakeUp.sId} [${wakeUp.scheduleConfig.type}]\n`;
  if (wakeUp.scheduleConfig.type === "cron") {
    content += `- Cron expression: ${wakeUp.scheduleConfig.cron}\n`;
    content += `- Wake-up fireCount: ${wakeUp.fireCount + 1} / ${wakeUp.maxFires}\n`;
    if (wakeUp.fireCount + 1 >= wakeUp.maxFires) {
      content += `- Warning: This wake-up will be automatically expired after. Recreate a new wake-up if needed.\n`;
    }
  }
  content += `</dust_system>\n`;
  content += `Wake-up reason: ${wakeUp.reason}`;

  return content;
}

export async function runWakeUpActivity({
  workspaceId,
  wakeUpId,
}: {
  workspaceId: string;
  wakeUpId: string;
}): Promise<void> {
  const wakeUpAndAuthRes = await WakeUpResource.fetchWakeUpAndAuthenticatorById(
    {
      workspaceId,
      wakeUpId,
    }
  );
  if (wakeUpAndAuthRes.isErr()) {
    logger.error(
      { wakeUpId, workspaceId, error: normalizeError(wakeUpAndAuthRes.error) },
      "Skipping wake-up: workspace or wake-up not found."
    );
    return;
  }

  const { auth, wakeUp } = wakeUpAndAuthRes.value;

  if (wakeUp.status !== "scheduled") {
    logger.info(
      { wakeUpStatus: wakeUp.status, wakeUpId, workspaceId },
      "Skipping wake-up: wake-up is not scheduled."
    );
    return;
  }

  const [c] = await ConversationResource.fetchByModelIds(auth, [
    wakeUp.conversationId,
  ]);
  if (!c) {
    logger.info(
      { wakeUpStatus: wakeUp.status, wakeUpId, workspaceId },
      "Cancelling wake-up: conversation not found."
    );
    await cancelWakeUpAndCleanupSchedule(auth, wakeUp);
    return;
  }

  const conversationResource = await ConversationResource.fetchById(
    auth,
    c.sId
  );
  if (!conversationResource) {
    logger.info(
      {
        wakeUpStatus: wakeUp.status,
        wakeUpId,
        workspaceId,
        error: "Conversation not found",
      },
      "Cancelling wake-up: conversation not accessible."
    );
    await cancelWakeUpAndCleanupSchedule(auth, wakeUp);
    return;
  }

  const { clientSideMCPServerIds, ...latestUserMessageModel } =
    await conversationResource.getContextFromLatestNonWakeUpUserMessage(auth);

  const requestedModel = resolvedModelFromUserMessageRow(
    latestUserMessageModel
  );

  const postMessageResult = await postUserMessage(auth, {
    conversationResource: conversationResource,
    content: buildWakeUpMessageContent(wakeUp.toJSON()),
    mentions: [{ configurationId: wakeUp.agentConfigurationId }],
    context: {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
      username: "dust_system",
      fullName: "Dust System",
      email: null,
      profilePictureUrl: null,
      origin: "wakeup",
      clientSideMCPServerIds,
    },
    skipToolsValidation: false,
    modelSelection: requestedModel ?? undefined,
  });

  if (postMessageResult.isErr()) {
    const {
      api_error: { message, type },
    } = postMessageResult.error;

    if (
      type === "agent_configuration_not_found" ||
      type === "agent_inaccessible" ||
      type === "model_disabled"
    ) {
      logger.info(
        {
          wakeUpId,
          workspaceId,
          error: postMessageResult.error,
        },
        "Cancelling wake-up: agent cannot be invoked."
      );
      await cancelWakeUpAndCleanupSchedule(auth, wakeUp);
      return;
    }

    throw new Error(`Error posting wake-up message: [${type}] ${message}`);
  }

  await wakeUp.markFired(auth);

  const cleanupRes = await wakeUp.cleanupTemporalScheduleIfCronTerminal(auth);
  if (cleanupRes.isErr()) {
    logger.error(
      {
        wakeUpId,
        workspaceId,
        error: normalizeError(cleanupRes.error),
      },
      "Failed cleaning up wake-up temporal state after fire."
    );
  }
}

// Marks a wake-up cancelled and, for cron wake-ups, deletes the backing
// Temporal schedule so it stops firing. We do not use WakeUpResource.cancel
// here: for one-shot wake-ups that would cancel the very workflow this activity
// runs in. Deleting the cron schedule is safe from within a scheduled run.
async function cancelWakeUpAndCleanupSchedule(
  auth: Authenticator,
  wakeUp: WakeUpResource
): Promise<void> {
  await wakeUp.markCancelled(auth);

  const cleanupRes = await wakeUp.cleanupTemporalScheduleIfCronTerminal(auth);
  if (cleanupRes.isErr()) {
    logger.error(
      {
        wakeUpId: wakeUp.sId,
        workspaceId: auth.getNonNullableWorkspace().sId,
        error: normalizeError(cleanupRes.error),
      },
      "Failed deleting wake-up schedule after cancelling."
    );
  }
}

export async function expireWakeUpActivity({
  workspaceId,
  wakeUpId,
}: {
  workspaceId: string;
  wakeUpId: string;
}): Promise<void> {
  const wakeUpAndAuthRes = await WakeUpResource.fetchWakeUpAndAuthenticatorById(
    {
      workspaceId,
      wakeUpId,
    }
  );
  if (wakeUpAndAuthRes.isErr()) {
    logger.error(
      { wakeUpId, workspaceId, error: normalizeError(wakeUpAndAuthRes.error) },
      "Expire wake-up: workspace or wake-up not found."
    );
    return;
  }
  const { auth, wakeUp } = wakeUpAndAuthRes.value;

  await wakeUp.markExpired(auth);

  const cleanupRes = await wakeUp.cleanupTemporalScheduleIfCronTerminal(auth);
  if (cleanupRes.isErr()) {
    logger.error(
      {
        wakeUpId,
        workspaceId,
        error: normalizeError(cleanupRes.error),
      },
      "Failed deleting wake-up schedule after expiring."
    );
  }
}
