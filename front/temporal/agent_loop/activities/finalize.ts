import type { AuthenticatorType } from "@app/lib/auth";
import { launchAgentMessageAnalyticsActivity } from "@app/temporal/agent_loop/activities/analytics";
import {
  finalizeCancellationActivity,
  notifyWorkflowError,
} from "@app/temporal/agent_loop/activities/common";
import { handleMentionsActivity } from "@app/temporal/agent_loop/activities/mentions";
import { conversationUnreadNotificationActivity } from "@app/temporal/agent_loop/activities/notification";
import { trackProgrammaticUsageActivity } from "@app/temporal/agent_loop/activities/usage_tracking";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

/**
 * Consolidated activity that runs all finalization tasks at the end of a successful agent loop.
 * This replaces the previous pattern of running 4 separate activities in Promise.all.
 */
export async function finalizeAgentLoopActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  await Promise.all([
    launchAgentMessageAnalyticsActivity(authType, agentLoopArgs),
    trackProgrammaticUsageActivity(authType, agentLoopArgs),
    conversationUnreadNotificationActivity(authType, agentLoopArgs),
    handleMentionsActivity(authType, agentLoopArgs),
  ]);
}

/**
 * Consolidated activity that runs finalization tasks when an agent loop is cancelled.
 */
export async function finalizeCancelledAgentLoopActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  await Promise.all([
    launchAgentMessageAnalyticsActivity(authType, agentLoopArgs),
    trackProgrammaticUsageActivity(authType, agentLoopArgs),
    finalizeCancellationActivity(authType, agentLoopArgs),
  ]);
}

/**
 * Consolidated activity that runs finalization tasks when an agent loop errors.
 */
export async function finalizeErroredAgentLoopActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs,
  error: Error
): Promise<void> {
  await Promise.all([
    launchAgentMessageAnalyticsActivity(authType, agentLoopArgs),
    trackProgrammaticUsageActivity(authType, agentLoopArgs),
    notifyWorkflowError(authType, {
      conversationId: agentLoopArgs.conversationId,
      agentMessageId: agentLoopArgs.agentMessageId,
      agentMessageVersion: agentLoopArgs.agentMessageVersion,
      error,
    }),
  ]);
}
