import { computeAndStoreAgentMessageCredits } from "@app/lib/api/assistant/credit_cost";
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
  updateResourceAndPublishEvent,
} from "@app/temporal/agent_loop/activities/common";
import { handleMentions } from "@app/temporal/agent_loop/activities/mentions";
import { conversationUnreadNotification } from "@app/temporal/agent_loop/activities/notification";
import { snapshotAgentMessageSkills } from "@app/temporal/agent_loop/activities/snapshot_skills";
import {
  launchEmitMetronomeUsageEvents,
  launchTrackProgrammaticUsage,
} from "@app/temporal/agent_loop/activities/usage_tracking";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import { getAgentLoopDataWithAuth } from "@app/types/assistant/agent_run";

const CREDITS_EXHAUSTED_ERROR_TITLE = "Workspace out of credits";
const CREDITS_EXHAUSTED_ERROR_MESSAGE_ADMIN =
  "Your workspace has run out of credits. Please purchase more credits to continue using Dust.";
const CREDITS_EXHAUSTED_ERROR_MESSAGE_MEMBER =
  "Your workspace has run out of credits. Please contact your administrator to purchase more credits.";

export async function finalizeSuccessfulAgentLoopActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);

  await Promise.all([
    snapshotAgentMessageSkills(auth, agentLoopArgs),
    launchAgentMessageAnalytics(auth, agentLoopArgs),
    launchTrackProgrammaticUsage(auth, agentLoopArgs),
    launchEmitMetronomeUsageEvents(auth, agentLoopArgs),
    computeAndStoreAgentMessageCredits(auth, {
      agentMessageId: agentLoopArgs.agentMessageId,
    }),
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

  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);

  await Promise.all([
    snapshotAgentMessageSkills(auth, agentLoopArgs),
    launchAgentMessageAnalytics(auth, agentLoopArgs),
    launchTrackProgrammaticUsage(auth, agentLoopArgs),
    launchEmitMetronomeUsageEvents(auth, agentLoopArgs),
    computeAndStoreAgentMessageCredits(auth, {
      agentMessageId: agentLoopArgs.agentMessageId,
    }),
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

  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);

  await Promise.all([
    snapshotAgentMessageSkills(auth, agentLoopArgs),
    launchAgentMessageAnalytics(auth, agentLoopArgs),
    launchTrackProgrammaticUsage(auth, agentLoopArgs),
    launchEmitMetronomeUsageEvents(auth, agentLoopArgs),
    computeAndStoreAgentMessageCredits(auth, {
      agentMessageId: agentLoopArgs.agentMessageId,
    }),
    conversationUnreadNotification(auth, agentLoopArgs),
    handleMentions(auth, agentLoopArgs),
  ]);
}

export async function finalizeCancelledAgentLoopActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  await finalizeCancellation(authType, agentLoopArgs);

  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);

  await Promise.all([
    snapshotAgentMessageSkills(auth, agentLoopArgs),
    launchAgentMessageAnalytics(auth, agentLoopArgs),
    launchTrackProgrammaticUsage(auth, agentLoopArgs),
    launchEmitMetronomeUsageEvents(auth, agentLoopArgs),
    computeAndStoreAgentMessageCredits(auth, {
      agentMessageId: agentLoopArgs.agentMessageId,
    }),
    sendEmailReplyOnError(
      auth,
      agentLoopArgs,
      "Agent execution was cancelled."
    ),
  ]);
}

/**
 * Stage 1 credit stop. Mirrors the errored finalize's shape (own flag → own dedicated finalize)
 * but publishes the retryable `credits_exhausted` agent error instead of a generic workflow
 * failure, so the user gets the "out of credits" message + Retry rather than a critical error.
 *
 * The terminal event is published HERE, not in the per-step gate activity: that keeps the gate a
 * pure decision and makes this the single place the stop is finalized — and the publish is
 * single-shot-guarded (markAgentMessageAsFailed no-ops if the message already left `created`), so
 * a finalize retry can't double-publish.
 */
export async function finalizeCreditStoppedAgentLoopActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs,
  { reason, step }: { reason: "credits_exhausted"; step: number }
): Promise<void> {
  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);

  const runAgentDataRes = await getAgentLoopDataWithAuth(auth, agentLoopArgs);
  if (runAgentDataRes.isOk()) {
    const { agentConfiguration, agentMessage, conversation } =
      runAgentDataRes.value;
    const message = auth.isAdmin()
      ? CREDITS_EXHAUSTED_ERROR_MESSAGE_ADMIN
      : CREDITS_EXHAUSTED_ERROR_MESSAGE_MEMBER;

    await updateResourceAndPublishEvent(auth, {
      event: {
        type: "agent_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: reason,
          message,
          metadata: {
            category: reason,
            errorTitle: CREDITS_EXHAUSTED_ERROR_TITLE,
          },
        },
        runIds: agentLoopArgs.dustRunIds ?? [],
      },
      agentMessage,
      conversation,
      step,
    });
  }

  await Promise.all([
    snapshotAgentMessageSkills(auth, agentLoopArgs),
    launchAgentMessageAnalytics(auth, agentLoopArgs),
    launchTrackProgrammaticUsage(auth, agentLoopArgs),
    launchEmitMetronomeUsageEvents(auth, agentLoopArgs),
    computeAndStoreAgentMessageCredits(auth, {
      agentMessageId: agentLoopArgs.agentMessageId,
    }),
    sendEmailReplyOnError(
      auth,
      agentLoopArgs,
      auth.isAdmin()
        ? CREDITS_EXHAUSTED_ERROR_MESSAGE_ADMIN
        : CREDITS_EXHAUSTED_ERROR_MESSAGE_MEMBER
    ),
  ]);
}

export async function finalizeErroredAgentLoopActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs,
  error: { message: string; name: string }
): Promise<void> {
  await notifyWorkflowError(authType, agentLoopArgs, error);

  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);

  await Promise.all([
    snapshotAgentMessageSkills(auth, agentLoopArgs),
    launchAgentMessageAnalytics(auth, agentLoopArgs),
    launchTrackProgrammaticUsage(auth, agentLoopArgs),
    launchEmitMetronomeUsageEvents(auth, agentLoopArgs),
    computeAndStoreAgentMessageCredits(auth, {
      agentMessageId: agentLoopArgs.agentMessageId,
    }),
    sendEmailReplyOnError(
      auth,
      agentLoopArgs,
      `Agent execution failed: ${error.message}`
    ),
  ]);
}
