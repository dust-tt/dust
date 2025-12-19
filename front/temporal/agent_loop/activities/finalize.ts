import type { AuthenticatorType } from "@app/lib/auth";
import { launchAgentMessageAnalytics } from "@app/temporal/agent_loop/activities/analytics";
import {
  finalizeCancellation,
  notifyWorkflowError,
} from "@app/temporal/agent_loop/activities/common";
import { handleMentions } from "@app/temporal/agent_loop/activities/mentions";
import { conversationUnreadNotificationActivity } from "@app/temporal/agent_loop/activities/notification";
import { snapshotAgentMessageSkills } from "@app/temporal/agent_loop/activities/snapshot_skills";
import { launchTrackProgrammaticUsage } from "@app/temporal/agent_loop/activities/usage_tracking";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

export async function finalizeSuccessfulAgentLoopActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  await Promise.all([
    snapshotAgentMessageSkills(authType, agentLoopArgs),
    launchAgentMessageAnalytics(authType, agentLoopArgs),
    launchTrackProgrammaticUsage(authType, agentLoopArgs),
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
