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
