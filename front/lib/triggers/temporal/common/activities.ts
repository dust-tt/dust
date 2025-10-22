import {
  isMCPConfigurationForRunAgent,
  isServerSideMCPServerConfiguration,
} from "@app/lib/actions/types/guards";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import {
  createConversation,
  postNewContentFragment,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { getTemporalClientForAgentNamespace } from "@app/lib/temporal";
import { checkTriggerForExecutionPerDayLimit } from "@app/lib/triggers/common";
import logger from "@app/logger/logger";
import type {
  AgentConfigurationType,
  APIErrorWithStatusCode,
  ContentFragmentInputWithFileIdType,
  ConversationType,
  Result,
} from "@app/types";
import { assertNever, Ok } from "@app/types";
import type { TriggerType } from "@app/types/assistant/triggers";

import { makeTriggerScheduleId } from "../schedule/client";

/**
 * We want to create individual conversations if the agent outcome will vary from user to user.
 */
async function shouldCreateIndividualConversations(
  auth: Authenticator,
  agentConfiguration: AgentConfigurationType,
  checkedAgentConfigurationIds: string[] = []
): Promise<boolean> {
  // Check if one of the actions is using a personal actions or a run agent action
  const mcpServerViews = await MCPServerViewResource.listByWorkspace(auth);
  const mcpServerViewsMap = new Map(
    mcpServerViews.map((mcpServerView) => [mcpServerView.sId, mcpServerView])
  );
  for (const action of agentConfiguration.actions) {
    if (isServerSideMCPServerConfiguration(action)) {
      const mcpServerView = mcpServerViewsMap.get(action.mcpServerViewId);
      if (!mcpServerView) {
        throw new Error(
          `MCP server view with ID ${action.mcpServerViewId} not found.`
        );
      }
      if (mcpServerView.oAuthUseCase === "personal_actions") {
        return true;
      }
      // Check the chain of agents
      if (
        isMCPConfigurationForRunAgent(action) &&
        action.childAgentId &&
        // Avoid infinite loop
        !checkedAgentConfigurationIds.includes(action.childAgentId)
      ) {
        const subAgentConfiguration = await getAgentConfiguration(auth, {
          agentId: action.childAgentId,
          variant: "full",
        });
        if (subAgentConfiguration) {
          const subCheck = await shouldCreateIndividualConversations(
            auth,
            subAgentConfiguration,
            [...checkedAgentConfigurationIds, agentConfiguration.sId]
          );
          if (subCheck) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

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
  let conversationTitle = `@${agentConfiguration.name} triggered (${trigger.kind})`;
  switch (trigger.kind) {
    case "schedule":
      conversationTitle += ` - ${new Intl.DateTimeFormat(undefined, {
        timeZone: trigger.configuration.timezone,
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date())}`;
      break;
    case "webhook":
      break;
    default:
      assertNever(trigger);
  }

  const newConversation = await createConversation(auth, {
    title: conversationTitle,
    visibility: "unlisted",
    triggerId: trigger.id,
  });

  const baseContext = {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
    username: auth.getNonNullableUser().username,
    fullName: auth.getNonNullableUser().fullName(),
    email: auth.getNonNullableUser().email,
    profilePictureUrl: null,
    origin: "triggered" as const,
    lastTriggerRunAt: lastRunAt?.getTime() ?? null,
  };

  if (contentFragment) {
    await postNewContentFragment(auth, newConversation, contentFragment, null);
  }

  const messageRes = await postUserMessage(auth, {
    conversation: newConversation,
    content:
      `:mention[${agentConfiguration.name}]{sId=${agentConfiguration.sId}}` +
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

class TriggerNonRetryableError extends Error {}

export async function runTriggeredAgentsActivity({
  userId,
  workspaceId,
  trigger,
  contentFragment,
}: {
  userId: string;
  workspaceId: string;
  trigger: TriggerType;
  contentFragment?: ContentFragmentInputWithFileIdType;
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

  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: trigger.agentConfigurationId,
    variant: "full",
  });

  if (!agentConfiguration) {
    throw new TriggerNonRetryableError(
      `Agent configuration with ID ${trigger.agentConfigurationId} not found in workspace ${auth.getNonNullableWorkspace().id}.`
    );
  }

  const useIndividualConversations = await shouldCreateIndividualConversations(
    auth,
    agentConfiguration
  );

  const triggerResource = await TriggerResource.fetchById(auth, trigger.sId);
  if (!triggerResource) {
    throw new TriggerNonRetryableError(
      `Trigger with ID ${trigger.sId} not found.`
    );
  }

  if (!triggerResource.enabled) {
    logger.info({ triggerId: trigger.sId }, "Trigger is disabled.");
    return;
  }

  const rateLimiterRes = await checkTriggerForExecutionPerDayLimit(auth, {
    trigger: triggerResource.toJSON(),
  });
  if (rateLimiterRes.isErr()) {
    throw new TriggerNonRetryableError(rateLimiterRes.error.message);
  }

  const subscribers = await triggerResource.getSubscribers(auth);
  if (subscribers.isErr()) {
    throw new TriggerNonRetryableError("Error getting trigger subscribers.");
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

  const subscribersAuths = await Promise.all(
    subscribers.value.map((s) =>
      Authenticator.fromUserIdAndWorkspaceId(
        s.sId,
        auth.getNonNullableWorkspace().sId
      )
    )
  );

  if (useIndividualConversations) {
    // Create conversations for the editor and all the subscribers
    for (const tempAuth of [auth, ...subscribersAuths]) {
      try {
        await createConversationForAgentConfiguration({
          auth: tempAuth,
          agentConfiguration,
          trigger,
          lastRunAt,
          contentFragment,
        });
      } catch (error) {
        // Might happen if a subscriber do not have the right permissions to use the agent
        logger.error(
          {
            error,
            agentConfigurationId: trigger.agentConfigurationId,
            userId: tempAuth.getNonNullableUser().sId,
            workspaceId: tempAuth.getNonNullableWorkspace().sId,
          },
          "Error creating conversation for agent configuration."
        );
      }
    }
  } else {
    // Create a single conversation for the editor
    const conversationResult = await createConversationForAgentConfiguration({
      auth,
      agentConfiguration,
      trigger,
      lastRunAt,
      contentFragment,
    });
    if (conversationResult.isErr()) {
      throw new Error(
        `Error creating conversation: ${conversationResult.error.api_error.message}`,
        {
          cause: conversationResult.error,
        }
      );
    }

    // Upsert all the subscribers as participants
    for (const tempAuth of subscribersAuths) {
      await ConversationResource.upsertParticipation(tempAuth, {
        conversation: conversationResult.value,
        action: "subscribed",
      });
    }
  }
}
