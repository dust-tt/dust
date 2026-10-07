export function formatGlobalRollout(
  rolloutPercentage: number,
  conditions: string[]
): string {
  return [`${rolloutPercentage}%`, ...conditions].join(", ");
}
