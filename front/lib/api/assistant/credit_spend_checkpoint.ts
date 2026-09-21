import type { Authenticator } from "@app/lib/auth";
import { awuFromMicroUsd } from "@app/lib/metronome/constants";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { DEFAULT_CREDIT_SPEND_CHECKPOINT_THRESHOLD_AWU_CREDITS } from "@app/lib/resources/storage/models/credit_usage_configurations";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import type { PlanType } from "@app/types/plan";
import { isCreditPricedPlan } from "@app/types/plan";

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
 * Whether a message tree's cumulative spend has reached the checkpoint. Keeps the AWU rounding
 * in one place, outside deterministic workflow code.
 */
export function hasReachedCreditSpendCheckpoint({
  totalCostMicroUsd,
  thresholdAwuCredits,
}: {
  totalCostMicroUsd: number;
  thresholdAwuCredits: number;
}): boolean {
  return awuFromMicroUsd(totalCostMicroUsd) >= thresholdAwuCredits;
}

/**
 * @cc [owner:avervaet,label:product] checkpoint-plan-default
 * With no explicit workspace override, the checkpoint gate MUST default to disabled for a
 * credit-priced plan and to enabled for any other plan (including no plan). This is the
 * plan-tier default only: it MUST NOT be read once an explicit workspace override exists.
 */
export function resolveDefaultCreditSpendCheckpointEnabled(
  plan: PlanType | null
): boolean {
  return !plan || !isCreditPricedPlan(plan);
}

/**
 * @cc [owner:avervaet,label:product] checkpoint-config-workspace-override
 * `enabled` MUST be the workspace's configured `creditSpendCheckpointEnabled` when a
 * usage-configuration row exists for it and that value is non-NULL, and MUST fall back to
 * `resolveDefaultCreditSpendCheckpointEnabled` otherwise. `thresholdAwuCredits` MUST be the
 * workspace's configured `creditSpendCheckpointThresholdAwuCredits` when a usage-configuration
 * row exists for it, and MUST fall back to `DEFAULT_CREDIT_SPEND_CHECKPOINT_THRESHOLD_AWU_CREDITS`
 * otherwise. Callers MUST treat `enabled: false` as an unconditional exemption: the checkpoint
 * MUST NOT pause for that workspace regardless of spend, root-message status, or any other
 * condition.
 */
export async function getCreditSpendCheckpointConfig(
  auth: Authenticator
): Promise<{ enabled: boolean; thresholdAwuCredits: number }> {
  const config =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
  return {
    enabled:
      config?.creditSpendCheckpointEnabled ??
      resolveDefaultCreditSpendCheckpointEnabled(auth.plan()),
    thresholdAwuCredits:
      config?.creditSpendCheckpointThresholdAwuCredits ??
      DEFAULT_CREDIT_SPEND_CHECKPOINT_THRESHOLD_AWU_CREDITS,
  };
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
