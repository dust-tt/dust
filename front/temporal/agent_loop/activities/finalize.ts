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
  notifyWorkflowError,
} from "@app/temporal/agent_loop/activities/common";
import { handleMentions } from "@app/temporal/agent_loop/activities/mentions";
import { conversationUnreadNotificationActivity } from "@app/temporal/agent_loop/activities/notification";
import { snapshotAgentMessageSkills } from "@app/temporal/agent_loop/activities/snapshot_skills";
import { launchTrackProgrammaticUsage } from "@app/temporal/agent_loop/activities/usage_tracking";
import { signalButlerComplete } from "@app/temporal/butler/client";
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
  const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());

  let shouldSignalButler = false;
  if (featureFlags.includes("conversation_butler")) {
    const conversation = await ConversationResource.fetchById(
      auth,
      agentLoopArgs.conversationId
    );
    shouldSignalButler = conversation?.spaceId !== null;
  }

  await Promise.all([
    snapshotAgentMessageSkills(authType, agentLoopArgs),
    launchAgentMessageAnalytics(authType, agentLoopArgs),
    launchTrackProgrammaticUsage(authType, agentLoopArgs),
    conversationUnreadNotificationActivity(authType, agentLoopArgs),
    handleMentions(authType, agentLoopArgs),
    sendEmailReplyOnCompletion(authType, agentLoopArgs),
    shouldSignalButler
      ? signalButlerComplete({
          authType,
          conversationId: agentLoopArgs.conversationId,
        })
      : Promise.resolve(),
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
    sendEmailReplyOnError(
      authType,
      agentLoopArgs,
      `Agent execution failed: ${error.message}`
    ),
  ]);
}
