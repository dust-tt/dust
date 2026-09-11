import {
  isPoolDepleted,
  isProgrammaticApiBlocked,
  isUserBlocked,
} from "@app/lib/api/credits/access_control";
import { isProgrammaticUsage } from "@app/lib/api/programmatic_usage/tracking";
import type { Authenticator } from "@app/lib/auth";
import { CREDIT_SPEND_CHECKPOINT_THRESHOLD_AWU_CREDITS } from "@app/lib/constants/credits";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import { isCreditPricedPlan } from "@app/types/plan";

export type CreditCheckResult =
  | { shouldStop: false; reason: null }
  | { shouldStop: true; reason: "credits_exhausted" };

const DO_NOT_STOP: CreditCheckResult = { shouldStop: false, reason: null };

/**
 * Determines whether the agent loop should stop because the workspace's credit pool (or, for
 * programmatic usage, the monthly cap) is exhausted. Fails open, non-blocking for callers.
 *
 * Deliberately reuses the exact same Redis-cached, DB-backed state already checked once before
 * the message was sent (`isUserBlocked` / `isPoolDepleted` / `isProgrammaticApiBlocked`) rather than
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
    ? (await isUserBlocked(auth, user)) !== null
    : await isPoolDepleted(auth);
  if (blocked) {
    return { shouldStop: true, reason: "credits_exhausted" };
  }

  if (
    userMessageOrigin &&
    isProgrammaticUsage(auth, { userMessageOrigin }) &&
    (await isProgrammaticApiBlocked(auth))
  ) {
    return { shouldStop: true, reason: "credits_exhausted" };
  }

  return DO_NOT_STOP;
}

export type CreditSpendCheckpointCheckResult =
  | { crossed: false; exempt: boolean }
  | { crossed: true; thresholdAwuCredits: number };

const NOT_CROSSED: CreditSpendCheckpointCheckResult = {
  crossed: false,
  exempt: false,
};
const EXEMPT: CreditSpendCheckpointCheckResult = {
  crossed: false,
  exempt: true,
};

export async function checkCreditSpendCheckpointGate(
  auth: Authenticator,
  { consumedAwuCredits }: { consumedAwuCredits: number }
): Promise<CreditSpendCheckpointCheckResult> {
  const plan = auth.subscription()?.plan;

  if (!plan || !auth.user()) {
    return EXEMPT;
  }

  const thresholdAwuCredits = CREDIT_SPEND_CHECKPOINT_THRESHOLD_AWU_CREDITS;

  return consumedAwuCredits >= thresholdAwuCredits
    ? { crossed: true, thresholdAwuCredits }
    : NOT_CROSSED;
}
