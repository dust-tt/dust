/**
 * Dust credits use fixed-point millionths when persisted or allocated.
 *
 * Microcredits are not micro-USD: they share the same scale but represent a
 * different unit. Keep conversions here so callers cannot silently disagree on
 * rounding when credits become fractional.
 */
export const MICRO_CREDITS_PER_CREDIT = 1_000_000;

export function roundCreditsToMicroCredits(credits: number): number {
  return Math.round(credits * MICRO_CREDITS_PER_CREDIT);
}

export function microCreditsToCredits(microCredits: number): number {
  return microCredits / MICRO_CREDITS_PER_CREDIT;
}
