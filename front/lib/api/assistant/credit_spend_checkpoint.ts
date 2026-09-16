import type { Authenticator } from "@app/lib/auth";
import { CREDIT_SPEND_CHECKPOINT_THRESHOLD_AWU_CREDITS } from "@app/lib/constants/credits";
import { awuFromMicroUsd } from "@app/lib/metronome/constants";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";

const CREDIT_SPEND_CHECKPOINT_RESUMABLE_ORIGINS: UserMessageOrigin[] = [
  "web",
  "extension",
];

export function isExemptFromCreditSpendCheckpoint(
  auth: Authenticator,
  { userMessageOrigin }: { userMessageOrigin: UserMessageOrigin | null }
): boolean {
  return (
    !auth.user() ||
    !userMessageOrigin ||
    !CREDIT_SPEND_CHECKPOINT_RESUMABLE_ORIGINS.includes(userMessageOrigin)
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
