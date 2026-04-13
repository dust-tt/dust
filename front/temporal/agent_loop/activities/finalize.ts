import {
  sendEmailReplyOnCompletion,
  sendEmailReplyOnError,
} from "@app/lib/api/assistant/email/email_reply";
import {
  Authenticator,
  type AuthenticatorType,
  getFeatureFlags,
} from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { launchAgentMessageAnalytics } from "@app/temporal/agent_loop/activities/analytics";
import {
  finalizeCancellation,
  finalizeGracefulStop,
  notifyWorkflowError,
} from "@app/temporal/agent_loop/activities/common";
import { handleMentions } from "@app/temporal/agent_loop/activities/mentions";
import { conversationUnreadNotificationActivity } from "@app/temporal/agent_loop/activities/notification";
import { snapshotAgentMessageSkills } from "@app/temporal/agent_loop/activities/snapshot_skills";
import {
  launchEmitMetronomeUsageEvents,
  launchTrackProgrammaticUsage,
} from "@app/temporal/agent_loop/activities/usage_tracking";
import { signalProjectTodoComplete } from "@app/temporal/project_todo/client";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

export async function finalizeSuccessfulAgentLoopActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  const authResult = await Authenticator.fromJSON(authType);
  if (authResult.isErr()) {
    return;
  }

  const auth = authResult.value;
  const featureFlags = await getFeatureFlags(auth);

  let shouldSignalTodo = false;
  if (featureFlags.includes("project_todo")) {
    const conversation = await ConversationResource.fetchById(
      auth,
      agentLoopArgs.conversationId
    );
    shouldSignalTodo = conversation?.spaceId !== null;
  }

  await Promise.all([
    snapshotAgentMessageSkills(authType, agentLoopArgs),
    launchAgentMessageAnalytics(authType, agentLoopArgs),
    launchTrackProgrammaticUsage(authType, agentLoopArgs),
    launchEmitMetronomeUsageEvents(authType, agentLoopArgs),
    conversationUnreadNotificationActivity(authType, agentLoopArgs),
    handleMentions(authType, agentLoopArgs),
    sendEmailReplyOnCompletion(authType, agentLoopArgs),
    shouldSignalTodo
      ? signalProjectTodoComplete({
          authType,
          conversationId: agentLoopArgs.conversationId,
          messageId: agentLoopArgs.agentMessageId,
        })
      : Promise.resolve(),
  ]);
}

/**
 * Graceful stop mirrors the successful path: content is valid, all side-effects (analytics,
 * notifications, etc.) should run. We're not running email response nor project related signals
 * since the work is not finished per se since it was gracefully stopped and the intent of the user
 * is to steer or continue with something else.
 */
export async function finalizeGracefullyStoppedAgentLoopActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  await finalizeGracefulStop(authType, agentLoopArgs);

  await Promise.all([
    snapshotAgentMessageSkills(authType, agentLoopArgs),
    launchAgentMessageAnalytics(authType, agentLoopArgs),
    launchTrackProgrammaticUsage(authType, agentLoopArgs),
    launchEmitMetronomeUsageEvents(authType, agentLoopArgs),

    conversationUnreadNotificationActivity(authType, agentLoopArgs),
    handleMentions(authType, agentLoopArgs),
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
    launchEmitMetronomeUsageEvents(authType, agentLoopArgs),
    sendEmailReplyOnError(
      authType,
      agentLoopArgs,
      "Agent execution was cancelled."
    ),
  ]);
}

export async function finalizeErroredAgentLoopActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs,
  error: { message: string; name: string }
): Promise<void> {
  await notifyWorkflowError(authType, agentLoopArgs, error);

  await Promise.all([
    snapshotAgentMessageSkills(authType, agentLoopArgs),
    launchAgentMessageAnalytics(authType, agentLoopArgs),
    launchTrackProgrammaticUsage(authType, agentLoopArgs),
    launchEmitMetronomeUsageEvents(authType, agentLoopArgs),
    sendEmailReplyOnError(
      authType,
      agentLoopArgs,
      `Agent execution failed: ${error.message}`
    ),
  ]);
}
