import { getWorkspaceInfos } from "@app/lib/api/workspace";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import logger from "@app/logger/logger";
import { launchAgentMessageAnalytics } from "@app/temporal/agent_loop/activities/analytics";
import {
  finalizeCancellation,
  notifyWorkflowError,
} from "@app/temporal/agent_loop/activities/common";
import { launchHandleMentionsWorkflow } from "@app/temporal/mentions_queue/client";
import { launchConversationUnreadNotificationWorkflow } from "@app/temporal/notifications_queue/client";
import { launchTrackProgrammaticUsageWorkflow } from "@app/temporal/usage_queue/client";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

/**
 * Snapshot the skills that were used for this agent message.
 */
async function snapshotAgentMessageSkills(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  const authResult = await Authenticator.fromJSON(authType);
  if (authResult.isErr()) {
    return;
  }

  const auth = authResult.value;
  const owner = auth.getNonNullableWorkspace();

  const { agentMessageId } = agentLoopArgs;

  const messageRow = await MessageModel.findOne({
    where: {
      sId: agentMessageId,
      workspaceId: owner.id,
    },
    include: [
      {
        model: AgentMessageModel,
        as: "agentMessage",
        attributes: ["id", "agentConfigurationId"],
        required: true,
      },
    ],
  });

  if (!messageRow?.agentMessage) {
    return;
  }

  await SkillResource.snapshotConversationSkillsForMessage(auth, {
    agentConfigurationId: messageRow.agentMessage.agentConfigurationId,
    agentMessageId: messageRow.agentMessage.id,
    conversationId: messageRow.conversationId,
  });
}

/**
 * Launch conversation unread notification activity.
 */
async function launchConversationUnreadNotification(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  // Use `getWorkspaceInfos` for lightweight workspace info.
  const owner = await getWorkspaceInfos(authType.workspaceId);
  if (!owner) {
    logger.warn(
      { workspaceId: authType.workspaceId },
      "Failed to fetch workspace infos for conversation unread notification"
    );
    return;
  }

  const result = await launchConversationUnreadNotificationWorkflow({
    authType,
    agentLoopArgs,
  });

  if (result.isErr()) {
    logger.warn(
      {
        agentMessageId: agentLoopArgs.agentMessageId,
        error: result.error,
        workspaceId: authType.workspaceId,
      },
      "Failed to launch conversation unread notification workflow"
    );
  }
}

/**
 * Launch mentions workflow in fire-and-forget mode.
 */
async function launchHandleMentions(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  // Use `getWorkspaceInfos` for lightweight workspace info.
  const owner = await getWorkspaceInfos(authType.workspaceId);
  if (!owner) {
    logger.warn(
      { workspaceId: authType.workspaceId },
      "Failed to fetch workspace infos for mentions"
    );
    return;
  }

  const result = await launchHandleMentionsWorkflow({
    authType,
    agentLoopArgs,
  });

  if (result.isErr()) {
    logger.warn(
      {
        agentMessageId: agentLoopArgs.agentMessageId,
        error: result.error,
        workspaceId: authType.workspaceId,
      },
      "Failed to launch mentions workflow"
    );
  }
}

/**
 * Launch agent message analytics workflow in fire-and-forget mode.
 */
async function launchTrackProgrammaticUsage(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  // Use `getWorkspaceInfos` for lightweight workspace info.
  const owner = await getWorkspaceInfos(authType.workspaceId);
  if (!owner) {
    logger.warn(
      { workspaceId: authType.workspaceId },
      "Failed to fetch workspace infos for agent message analytics"
    );
    return;
  }

  const result = await launchTrackProgrammaticUsageWorkflow({
    authType,
    agentLoopArgs,
  });

  if (result.isErr()) {
    logger.warn(
      {
        agentMessageId: agentLoopArgs.agentMessageId,
        error: result.error,
        workspaceId: authType.workspaceId,
      },
      "Failed to launch agent message analytics workflow"
    );
  }
}

export async function finalizeSuccessfulAgentLoopActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  await Promise.all([
    snapshotAgentMessageSkills(authType, agentLoopArgs),
    launchAgentMessageAnalytics(authType, agentLoopArgs),
    launchTrackProgrammaticUsage(authType, agentLoopArgs),
    launchConversationUnreadNotification(authType, agentLoopArgs),
    launchHandleMentions(authType, agentLoopArgs),
  ]);
}

export async function finalizeCancelledAgentLoopActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  await finalizeCancellation(authType, agentLoopArgs);

  await Promise.all([
    snapshotAgentMessageSkills(authType, agentLoopArgs),
    launchAgentMessageAnalytics(authType, agentLoopArgs),
    launchTrackProgrammaticUsage(authType, agentLoopArgs),
  ]);
}

export async function finalizeErroredAgentLoopActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs,
  error: Error
): Promise<void> {
  await notifyWorkflowError(authType, agentLoopArgs, error);

  await Promise.all([
    snapshotAgentMessageSkills(authType, agentLoopArgs),
    launchAgentMessageAnalytics(authType, agentLoopArgs),
    launchTrackProgrammaticUsage(authType, agentLoopArgs),
  ]);
}
