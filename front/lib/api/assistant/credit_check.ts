import config from "@app/lib/api/config";
import {
  isApiBlocked,
  isProgrammaticApiBlocked,
  isUserBlocked,
} from "@app/lib/api/credits/access_control";
import { isProgrammaticUsage } from "@app/lib/api/programmatic_usage/tracking";
import { isSpendCapCounterReached } from "@app/lib/api/users/spend_limit";
import type { Authenticator } from "@app/lib/auth";
import { resolveSpendLimitCycleBounds } from "@app/lib/spend_limits/cycle";
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
    ? (await isUserBlocked(auth, user)) !== null
    : await isApiBlocked(auth);
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
  | { crossed: false }
  | { crossed: true; thresholdAwuCredits: number };

const DO_NOT_NOTIFY: CreditSpendCheckpointCheckResult = { crossed: false };

export async function checkCreditSpendCheckpointGate(
  auth: Authenticator
): Promise<CreditSpendCheckpointCheckResult> {
  const user = auth.user();
  if (!user) {
    return DO_NOT_NOTIFY;
  }
  const workspace = auth.getNonNullableWorkspace();
  const thresholdAwuCredits = config.getSpendCheckpointThresholdAwuCredits();

  const bounds = await resolveSpendLimitCycleBounds(workspace);
  if (!bounds) {
    return DO_NOT_NOTIFY;
  }

  const reached = await isSpendCapCounterReached(auth, {
    user,
    thresholdAwuCredits,
    bounds,
  });

  return reached ? { crossed: true, thresholdAwuCredits } : DO_NOT_NOTIFY;
}
