import {
  isPoolDepleted,
  isProgrammaticApiBlocked,
  isUserBlocked,
} from "@app/lib/api/credits/access_control";
import { isProgrammaticUsage } from "@app/lib/api/programmatic_usage/tracking";
import type { Authenticator } from "@app/lib/auth";
import { CREDIT_SPEND_CHECKPOINT_THRESHOLD_AWU_CREDITS } from "@app/lib/constants/credits";
import { awuFromMicroUsd } from "@app/lib/metronome/constants";
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

/**
 * @cc [owner:avervaet,label:product] checkpoint-exempts-unattended-usage
 * The check MUST return exempt when there is no user on the auth or when the message origin is
 * programmatic usage (same rule as the pool gate). Nobody is on the web app to answer the pause
 * in those cases, so pausing would only hang the caller.
 */
export function isCreditSpendCheckpointExempt(
  auth: Authenticator,
  { userMessageOrigin }: { userMessageOrigin: UserMessageOrigin | null }
): boolean {
  return (
    !auth.user() ||
    (!!userMessageOrigin && isProgrammaticUsage(auth, { userMessageOrigin }))
  );
}

/**
 * Whether a message tree's cumulative spend has reached the checkpoint. Keeps the threshold and
 * its AWU rounding in one place, outside deterministic workflow code.
 */
export function hasReachedCreditSpendCheckpoint({
  totalCostMicroUsd,
}: {
  totalCostMicroUsd: number;
}): boolean {
  return (
    awuFromMicroUsd(totalCostMicroUsd) >=
    CREDIT_SPEND_CHECKPOINT_THRESHOLD_AWU_CREDITS
  );
}
