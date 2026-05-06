import type { Authenticator } from "@app/lib/auth";
import { DEFAULT_REINFORCEMENT_CAP_MICRO_USD } from "@app/lib/reinforcement/constants";

/**
 * Return the workspace's monthly reinforcement cap in microUSD.
 * Uses the workspace metadata override if set, otherwise the default ($100).
 */
export function getReinforcementMonthlyCapMicroUsd(
  auth: Authenticator
): number {
  const workspace = auth.getNonNullableWorkspace();
  return typeof workspace.metadata?.reinforcementCapMicroUsd === "number"
    ? workspace.metadata.reinforcementCapMicroUsd
    : DEFAULT_REINFORCEMENT_CAP_MICRO_USD;
}
