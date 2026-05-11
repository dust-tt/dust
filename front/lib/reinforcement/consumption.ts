import type { Authenticator } from "@app/lib/auth";
import type { BillingCycle } from "@app/lib/client/subscription";
import { getMetronomeContractById } from "@app/lib/metronome/client";
import {
  DEFAULT_REINFORCEMENT_CAP_MICRO_USD,
  DEFAULT_SELF_IMPROVEMENT_CAP_PER_SKILL_MICRO_USD,
} from "@app/lib/reinforcement/constants";
import type { LightWorkspaceType } from "@app/types/user";

/**
 * Return the workspace's monthly reinforcement cap in microUSD.
 * Uses the workspace metadata override if set, otherwise the default ($100).
 */
export function getReinforcementMonthlyCapMicroUsd(
  workspace: LightWorkspaceType
): number {
  return typeof workspace.metadata?.reinforcementCapMicroUsd === "number"
    ? workspace.metadata.reinforcementCapMicroUsd
    : DEFAULT_REINFORCEMENT_CAP_MICRO_USD;
}

/**
 * Return the workspace's self-improvement cost cap per skill in microUSD.
 * Uses the workspace metadata override if set, otherwise the default ($20).
 */
export function getWorkspaceDefaultSelfImprovementCapPerSkillMicroUsd(
  workspace: LightWorkspaceType
): number {
  return typeof workspace.metadata?.selfImprovementCapPerSkillMicroUsd ===
    "number"
    ? workspace.metadata.selfImprovementCapPerSkillMicroUsd
    : DEFAULT_SELF_IMPROVEMENT_CAP_PER_SKILL_MICRO_USD;
}

function currentCalendarMonth(): BillingCycle {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return {
    cycleStart: new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)),
    cycleEnd: new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0)),
  };
}

/**
 * Return the start and end of the current reinforcement billing period.
 *
 * Uses the Metronome contract's billing period as the source of truth when
 * available. Falls back to the current calendar month otherwise.
 */
export async function getCurrentPeriod(
  auth: Authenticator
): Promise<BillingCycle> {
  const subscription = auth.subscription();
  const workspace = auth.workspace();

  const metronomeContractId = subscription?.metronomeContractId ?? null;
  const metronomeCustomerId = workspace?.metronomeCustomerId ?? null;

  if (metronomeContractId && metronomeCustomerId) {
    const contractResult = await getMetronomeContractById({
      metronomeCustomerId,
      metronomeContractId,
    });

    if (contractResult.isOk()) {
      const contract = contractResult.value;
      const currentPeriod = contract.subscriptions
        ?.map((s) => s.billing_periods?.current)
        .find((bp) => bp !== undefined);

      if (currentPeriod) {
        return {
          cycleStart: new Date(currentPeriod.starting_at),
          cycleEnd: new Date(currentPeriod.ending_before),
        };
      }
    }
  }

  return currentCalendarMonth();
}
