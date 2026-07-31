import {
  AGENT_MESSAGE_CREDIT_APPROVAL_THRESHOLD,
  fetchCreditApprovalContext,
  fetchCreditApprovalStep,
} from "@app/lib/api/assistant/credit_approval";
import { computeAgentMessageCredits } from "@app/lib/api/assistant/credit_cost";
import { isProgrammaticUsage } from "@app/lib/api/programmatic_usage/tracking";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import {
  isApiBlocked,
  isProgrammaticApiBlocked,
  isUserBlocked,
} from "@app/lib/metronome/user_block";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import { isCreditPricedPlan } from "@app/types/plan";

export type CreditCheckResult =
  | { shouldStop: false; reason: null }
  | { shouldStop: true; reason: "credits_exhausted" }
  // Not a failure: the message crossed the per-message credit threshold and the loop parks itself
  // until the user says whether to continue. See `checkMessageCreditApprovalGate`.
  | {
      shouldStop: true;
      reason: "credit_approval_required";
      costCredits: number;
    };

const DO_NOT_STOP: CreditCheckResult = { shouldStop: false, reason: null };

/**
 * Determines whether the agent loop should stop because the workspace's credit pool (or, for
 * programmatic usage, the monthly cap) is exhausted. Fails open, non-blocking for callers.
 *
 * Deliberately reuses the exact same Redis-cached, DB-backed state already checked once before
 * the message was sent (`isUserBlocked` / `isApiBlocked` / `isProgrammaticApiBlocked`) rather than
 * reading a live Metronome balance. This keeps Metronome out of the agent loop entirely, at the
 * accepted cost of an expensive multi-step message being able to exceed the cap before the state
 * it last read catches up.
 */
export async function checkPoolCreditGate(
  auth: Authenticator,
  { userMessageOrigin }: { userMessageOrigin: UserMessageOrigin | null }
): Promise<CreditCheckResult> {
  const owner = auth.getNonNullableWorkspace();
  const plan = auth.subscription()?.plan;

  if (!owner.metronomeCustomerId || !plan || !isCreditPricedPlan(plan)) {
    return DO_NOT_STOP;
  }

  const user = auth.user();
  const blocked = user
    ? (await isUserBlocked(owner, user)) !== null
    : await isApiBlocked(owner.sId);
  if (blocked) {
    return { shouldStop: true, reason: "credits_exhausted" };
  }

  if (
    userMessageOrigin &&
    isProgrammaticUsage(auth, { userMessageOrigin }) &&
    (await isProgrammaticApiBlocked(owner.sId))
  ) {
    return { shouldStop: true, reason: "credits_exhausted" };
  }

  return DO_NOT_STOP;
}

/**
 * Determines whether the agent loop should stop because a single message is running away with credits.
 */
export async function checkMessageCreditApprovalGate(
  auth: Authenticator,
  {
    agentMessageId,
    userMessageId,
    userMessageOrigin,
  }: {
    agentMessageId: string;
    // sId of the user message that started this run. Used to tell a root message from a sub-agent
    // one: only the root asks, since its cost already covers its descendants.
    userMessageId: string;
    userMessageOrigin: UserMessageOrigin | null;
  }
): Promise<CreditCheckResult> {
  const featureFlags = await getFeatureFlags(auth);
  if (!featureFlags.includes("credit_approval_gate")) {
    return DO_NOT_STOP;
  }

  // The point of this gate is to prompt the user when a single message runs away with credits.
  // Skip programmatic and API-key usage: nobody is around to answer the prompt.
  if (
    auth.authMethod() === "api_key" ||
    (userMessageOrigin && isProgrammaticUsage(auth, { userMessageOrigin }))
  ) {
    return DO_NOT_STOP;
  }

  const approvalContext = await fetchCreditApprovalContext(auth, {
    agentMessageId,
    userMessageId,
  });

  if (!approvalContext) {
    return DO_NOT_STOP;
  }

  // For now only check the root message.
  // TODO: break the loop from sub-agents and bubble the approval request up to the root message.
  if (!approvalContext.isRootAgentMessage) {
    return DO_NOT_STOP;
  }

  // If the user has already been asked once for this message, don't ask again.
  const askedAtStep = await fetchCreditApprovalStep(auth, {
    agentMessageModelId: approvalContext.agentMessageModelId,
  });
  if (askedAtStep !== null) {
    return DO_NOT_STOP;
  }

  const computed = await computeAgentMessageCredits(auth, { agentMessageId });
  // Null means nothing billable is attributed to the message yet — not a zero-cost message.
  if (computed?.costCredits == null) {
    return DO_NOT_STOP;
  }

  if (computed.costCredits <= AGENT_MESSAGE_CREDIT_APPROVAL_THRESHOLD) {
    return DO_NOT_STOP;
  }

  return {
    shouldStop: true,
    reason: "credit_approval_required",
    costCredits: computed.costCredits,
  };
}
