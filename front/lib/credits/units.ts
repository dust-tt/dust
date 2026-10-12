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

/**
 * @cc [owner:sfriquet,label:product] largest-remainder-micro-credits
 * The returned microcredits MUST add up to the sum of the exact amounts rounded to the
 * microcredit. Each amount MUST be rounded down, and the remaining microcredits MUST go one each to
 * the amounts with the largest fractional parts, ties going to the earlier amount.
 */
export function allocateMicroCreditsByLargestRemainder(
  exactCreditMicros: number[]
): number[] {
  const totalCreditMicro = Math.round(
    exactCreditMicros.reduce((total, creditMicro) => total + creditMicro, 0)
  );
  const floorCreditMicros = exactCreditMicros.map((creditMicro) =>
    Math.floor(creditMicro)
  );
  const remainderCreditMicro =
    totalCreditMicro -
    floorCreditMicros.reduce((total, creditMicro) => total + creditMicro, 0);
  const indexesReceivingRemainder = new Set(
    exactCreditMicros
      .map((creditMicro, index) => ({
        index,
        fractionalCreditMicro: creditMicro - floorCreditMicros[index],
      }))
      .sort(
        (left, right) =>
          right.fractionalCreditMicro - left.fractionalCreditMicro ||
          left.index - right.index
      )
      .slice(0, remainderCreditMicro)
      .map(({ index }) => index)
  );

  return floorCreditMicros.map(
    (creditMicro, index) =>
      creditMicro + (indexesReceivingRemainder.has(index) ? 1 : 0)
  );
}
