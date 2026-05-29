import {
  sendEmailReplyOnCompletion,
  sendEmailReplyOnError,
} from "@app/lib/api/assistant/email/email_reply";
import { Authenticator, type AuthenticatorType } from "@app/lib/auth";
import { launchAgentMessageAnalytics } from "@app/temporal/agent_loop/activities/analytics";
import {
  finalizeCancellation,
  finalizeGracefulStop,
  finalizeInterruption,
  notifyWorkflowError,
} from "@app/temporal/agent_loop/activities/common";
import { handleMentions } from "@app/temporal/agent_loop/activities/mentions";
import { conversationUnreadNotification } from "@app/temporal/agent_loop/activities/notification";
import { snapshotAgentMessageSkills } from "@app/temporal/agent_loop/activities/snapshot_skills";
import {
  launchEmitMetronomeUsageEvents,
  launchTrackProgrammaticUsage,
} from "@app/temporal/agent_loop/activities/usage_tracking";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

export async function finalizeSuccessfulAgentLoopActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  const auth = await Authenticator.fromJSON(authType);

  await Promise.all([
    snapshotAgentMessageSkills(auth, agentLoopArgs),
    launchAgentMessageAnalytics(auth, agentLoopArgs),
    launchTrackProgrammaticUsage(auth, agentLoopArgs),
    launchEmitMetronomeUsageEvents(auth, agentLoopArgs),
    conversationUnreadNotification(auth, agentLoopArgs),
    handleMentions(auth, agentLoopArgs),
    sendEmailReplyOnCompletion(auth, agentLoopArgs),
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

  const auth = await Authenticator.fromJSON(authType);

  await Promise.all([
    snapshotAgentMessageSkills(auth, agentLoopArgs),
    launchAgentMessageAnalytics(auth, agentLoopArgs),
    launchTrackProgrammaticUsage(auth, agentLoopArgs),
    launchEmitMetronomeUsageEvents(auth, agentLoopArgs),

    conversationUnreadNotification(auth, agentLoopArgs),
    handleMentions(auth, agentLoopArgs),
  ]);
}

/**
 * Interrupt mirrors the cancelled path (immediate kill) but also continues processing
 * any pending queued messages: the user chose to redirect, not abort entirely.
 *
 * Intentionally omits `sendEmailReplyOnError`: a new agent message is immediately created
 * to handle the queued request, so there is nothing to report as an error. If you add a
 * new side-effect to `finalizeCancelledAgentLoopActivity`, consider whether it also applies here.
 */
export async function finalizeInterruptedAgentLoopActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  await finalizeInterruption(authType, agentLoopArgs);

  const auth = await Authenticator.fromJSON(authType);

  await Promise.all([
    snapshotAgentMessageSkills(auth, agentLoopArgs),
    launchAgentMessageAnalytics(auth, agentLoopArgs),
    launchTrackProgrammaticUsage(auth, agentLoopArgs),
    launchEmitMetronomeUsageEvents(auth, agentLoopArgs),
    conversationUnreadNotification(auth, agentLoopArgs),
    handleMentions(auth, agentLoopArgs),
  ]);
}

export async function finalizeCancelledAgentLoopActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  await finalizeCancellation(authType, agentLoopArgs);

  const auth = await Authenticator.fromJSON(authType);

  await Promise.all([
    snapshotAgentMessageSkills(auth, agentLoopArgs),
    launchAgentMessageAnalytics(auth, agentLoopArgs),
    launchTrackProgrammaticUsage(auth, agentLoopArgs),
    launchEmitMetronomeUsageEvents(auth, agentLoopArgs),
    sendEmailReplyOnError(
      auth,
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

  const auth = await Authenticator.fromJSON(authType);

  await Promise.all([
    snapshotAgentMessageSkills(auth, agentLoopArgs),
    launchAgentMessageAnalytics(auth, agentLoopArgs),
    launchTrackProgrammaticUsage(auth, agentLoopArgs),
    launchEmitMetronomeUsageEvents(auth, agentLoopArgs),
    sendEmailReplyOnError(
      auth,
      agentLoopArgs,
      `Agent execution failed: ${error.message}`
    ),
  ]);
}
