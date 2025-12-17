import type { AuthenticatorType } from "@app/lib/auth";
import { launchAgentMessageAnalyticsActivity } from "@app/temporal/agent_loop/activities/analytics";
import {
  finalizeCancellationActivity,
  notifyWorkflowError,
} from "@app/temporal/agent_loop/activities/common";
import { handleMentionsActivity } from "@app/temporal/agent_loop/activities/mentions";
import { conversationUnreadNotificationActivity } from "@app/temporal/agent_loop/activities/notification";
import { snapshotAgentMessageSkills } from "@app/temporal/agent_loop/activities/snapshot_skills";
import { launchTrackProgrammaticUsageActivity } from "@app/temporal/agent_loop/activities/usage_tracking";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

export async function finalizeSuccessfulAgentLoopActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  await Promise.all([
    launchAgentMessageAnalyticsActivity(authType, agentLoopArgs),
    trackProgrammaticUsageActivity(authType, agentLoopArgs),
    conversationUnreadNotificationActivity(authType, agentLoopArgs),
    handleMentionsActivity(authType, agentLoopArgs),
    snapshotAgentMessageSkills(authType, agentLoopArgs),
  ]);
}

export async function finalizeCancelledAgentLoopActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  await Promise.all([
    launchAgentMessageAnalyticsActivity(authType, agentLoopArgs),
    launchTrackProgrammaticUsageActivity(authType, agentLoopArgs),
    finalizeCancellationActivity(authType, agentLoopArgs),
    snapshotAgentMessageSkills(authType, agentLoopArgs),
  ]);
}

export async function finalizeErroredAgentLoopActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs,
  error: Error
): Promise<void> {
  await Promise.all([
    launchAgentMessageAnalyticsActivity(authType, agentLoopArgs),
    launchTrackProgrammaticUsageActivity(authType, agentLoopArgs),
    notifyWorkflowError(authType, {
      conversationId: agentLoopArgs.conversationId,
      agentMessageId: agentLoopArgs.agentMessageId,
      agentMessageVersion: agentLoopArgs.agentMessageVersion,
      error,
    }),
    snapshotAgentMessageSkills(authType, agentLoopArgs),
  ]);
}
