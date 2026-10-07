export const NO_FEATURE_FLAG_CONDITION = "none";

export function formatGlobalRollout(
  rolloutPercentage: number,
  condition: string | null
): string {
  return condition === null
    ? `${rolloutPercentage}%`
    : `${rolloutPercentage}%, ${condition}`;
}
