import { computeAndStoreAgentMessageCredits } from "@app/lib/api/assistant/credit_cost";
import {
  sendEmailReplyOnCompletion,
  sendEmailReplyOnError,
} from "@app/lib/api/assistant/email/email_reply";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import logger from "@app/logger/logger";
import {
  launchAgentMessageAnalytics,
  launchAgentMessageConsumptionAttribution,
} from "@app/temporal/agent_loop/activities/analytics";
import {
  creditsExhaustedMessage,
  finalizeCancellation,
  finalizeCreditStop,
  finalizeGracefulStop,
  finalizeInterruption,
  notifyWorkflowError,
} from "@app/temporal/agent_loop/activities/common";
import { handleMentions } from "@app/temporal/agent_loop/activities/mentions";
import {
  activationNewConversationNotification,
  conversationUnreadNotification,
} from "@app/temporal/agent_loop/activities/notification";
import { snapshotAgentMessageSkills } from "@app/temporal/agent_loop/activities/snapshot_skills";
import {
  launchEmitMetronomeUsageEvents,
  launchTrackProgrammaticUsage,
} from "@app/temporal/agent_loop/activities/usage_tracking";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import type { ModelId } from "@app/types/shared/model_id";
import { normalizeError } from "@app/types/shared/utils/error_utils";

async function launchAgentMessageConsumptionAttributionAfterPersistingInputs(
  auth: Authenticator,
  agentLoopArgs: AgentLoopArgs,
  {
    creditArgs = agentLoopArgs,
  }: {
    creditArgs?: { agentMessageId: string; dustRunIds?: string[] };
  } = {}
): Promise<void> {
  // Consumption analytics needs the authoritative bill, usage type, and historical skill snapshot
  // before its attribution workflow can safely materialize Elasticsearch documents.
  await snapshotAgentMessageSkills(auth, agentLoopArgs);
  await computeAndStoreAgentMessageCredits(auth, {
    ...creditArgs,
    conversationId: agentLoopArgs.conversationId,
  });

  await launchAgentMessageConsumptionAttribution(auth, agentLoopArgs);
}

export async function finalizeSuccessfulAgentLoopActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);

  await Promise.all([
    launchAgentMessageAnalytics(auth, agentLoopArgs),
    launchAgentMessageConsumptionAttributionAfterPersistingInputs(
      auth,
      agentLoopArgs
    ),
    launchTrackProgrammaticUsage(auth, agentLoopArgs),
    launchEmitMetronomeUsageEvents(auth, agentLoopArgs),
    conversationUnreadNotification(auth, agentLoopArgs),
    activationNewConversationNotification(auth, agentLoopArgs),
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
    launchAgentMessageAnalytics(auth, agentLoopArgs),
    launchAgentMessageConsumptionAttributionAfterPersistingInputs(
      auth,
      agentLoopArgs
    ),
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

  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);

  await Promise.all([
    launchAgentMessageAnalytics(auth, agentLoopArgs),
    launchAgentMessageConsumptionAttributionAfterPersistingInputs(
      auth,
      agentLoopArgs
    ),
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

  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);

  await Promise.all([
    launchAgentMessageAnalytics(auth, agentLoopArgs),
    launchAgentMessageConsumptionAttributionAfterPersistingInputs(
      auth,
      agentLoopArgs
    ),
    launchTrackProgrammaticUsage(auth, agentLoopArgs),
    launchEmitMetronomeUsageEvents(auth, agentLoopArgs),
    sendEmailReplyOnError(
      auth,
      agentLoopArgs,
      "Agent execution was cancelled."
    ),
  ]);
}

export async function finalizeCreditStoppedAgentLoopActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  await finalizeCreditStop(authType, agentLoopArgs);

  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);

  await Promise.all([
    launchAgentMessageAnalytics(auth, agentLoopArgs),
    launchAgentMessageConsumptionAttributionAfterPersistingInputs(
      auth,
      agentLoopArgs,
      {
        creditArgs: { agentMessageId: agentLoopArgs.agentMessageId },
      }
    ),
    launchTrackProgrammaticUsage(auth, agentLoopArgs),
    launchEmitMetronomeUsageEvents(auth, agentLoopArgs),
    sendEmailReplyOnError(auth, agentLoopArgs, creditsExhaustedMessage(auth)),
  ]);
}

// Attribute the failure to the tools that never finished. The worker that ran them may have died
// without logging anything (heartbeat timeouts), but the action rows it left behind in a
// non-final status carry the tool identity. Diagnostic only: it must never fail the finalize
// activity, which carries billing, analytics and email side effects, so the DB read is
// best-effort. Exported for tests.
export async function logStuckToolsForErroredAgentMessage(
  auth: Authenticator,
  {
    agentLoopArgs,
    agentMessageModelId,
    error,
  }: {
    agentLoopArgs: Pick<AgentLoopArgs, "conversationId" | "agentMessageId">;
    agentMessageModelId: ModelId;
    error: { message: string; name: string };
  }
): Promise<void> {
  let stuckTools: {
    actionModelId: ModelId;
    status: string;
    toolName: string;
    mcpServerName: string;
  }[] = [];
  try {
    const actions =
      await AgentMCPActionResource.listNonFinalActionsForAgentMessage(auth, {
        agentMessageModelId,
      });
    stuckTools = actions.map((action) => ({
      actionModelId: action.id,
      status: action.status,
      toolName: action.toolConfiguration.name,
      mcpServerName: action.toolConfiguration.mcpServerName,
    }));
  } catch (err) {
    logger.error(
      {
        err: normalizeError(err),
        conversationId: agentLoopArgs.conversationId,
        agentMessageId: agentLoopArgs.agentMessageId,
      },
      "Failed to list stuck tools for errored agent message"
    );
  }

  logger.warn(
    {
      conversationId: agentLoopArgs.conversationId,
      agentMessageId: agentLoopArgs.agentMessageId,
      workspaceId: auth.getNonNullableWorkspace().sId,
      workflowErrorName: error.name,
      workflowErrorMessage: error.message,
      stuckTools,
    },
    "Agent loop finalized as errored"
  );
}

export async function finalizeErroredAgentLoopActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs,
  error: { message: string; name: string }
): Promise<void> {
  const agentMessageModelId = await notifyWorkflowError(
    authType,
    agentLoopArgs,
    error
  );

  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);

  if (agentMessageModelId !== null) {
    await logStuckToolsForErroredAgentMessage(auth, {
      agentLoopArgs,
      agentMessageModelId,
      error,
    });
  }

  await Promise.all([
    launchAgentMessageAnalytics(auth, agentLoopArgs),
    launchAgentMessageConsumptionAttributionAfterPersistingInputs(
      auth,
      agentLoopArgs
    ),
    launchTrackProgrammaticUsage(auth, agentLoopArgs),
    launchEmitMetronomeUsageEvents(auth, agentLoopArgs),
    sendEmailReplyOnError(
      auth,
      agentLoopArgs,
      `Agent execution failed: ${error.message}`
    ),
  ]);
}
