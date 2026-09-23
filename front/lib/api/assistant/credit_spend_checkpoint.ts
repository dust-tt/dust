import type { Authenticator } from "@app/lib/auth";
import { CREDIT_SPEND_CHECKPOINT_THRESHOLD_AWU_CREDITS } from "@app/lib/constants/credits";
import { awuFromMicroUsd } from "@app/lib/metronome/constants";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { DEFAULT_CREDIT_SPEND_CHECKPOINT_ENABLED } from "@app/lib/resources/storage/models/credit_usage_configurations";
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

export async function getCreditSpendCheckpointEnabled(
  auth: Authenticator
): Promise<boolean> {
  const config =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
  return config
    ? config.creditSpendCheckpointThresholdAwuCredits !== null
    : DEFAULT_CREDIT_SPEND_CHECKPOINT_ENABLED;
}

/**
 * @cc [owner:avervaet,label:product] checkpoint-resolved-skips
 * When the message's checkpoint status is `acknowledged` or `stopped`, this MUST return false,
 * whatever the spend. A message whose pause was already resolved, either way, is never asked
 * again.
 */
/**
 * @cc [owner:avervaet,label:product] checkpoint-root-messages-only
 * When the triggering user message is agentic (the agent message belongs to a sub-agent), this
 * MUST return false, whatever the spend. Only the root message can pause: a paused sub-agent
 * would hang its parent's tool call with no one able to acknowledge it.
 */
export function hasCrossedCreditSpendCheckpoint({
  isExempt,
  isRootAgentMessage,
  status,
}: {
  isExempt: boolean;
  isRootAgentMessage: boolean;
  status: "paused" | "acknowledged" | "stopped" | null;
}): boolean {
  return (
    !isExempt &&
    isRootAgentMessage &&
    status !== "acknowledged" &&
    status !== "stopped"
  );
}
