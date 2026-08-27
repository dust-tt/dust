import type { SupportedCurrency } from "@app/types/currency";

export type AwuPoolSummaryResponseBody = {
  totalRemainingCredits: number;
  totalActiveCredits: number;
  /**
   * PAYG overage consumed so far this billing period — credits charged on
   * top of the workspace pool. `null` when the workspace is not on PAYG or
   * no overage has been incurred this period.
   */
  overageCredits: number | null;
  /** Fiat cost of `overageCredits`, in cents. `null` when `overageCredits` is null. */
  overageAmountCents: number | null;
  /** Invoice currency — needed to format `overageAmountCents`. */
  overageCurrency: SupportedCurrency | null;
  /**
   * Mean pool credits consumed per finalized billing cycle, averaged over
   * the last `cyclesUsedForAverage` finalized invoices (most recent,
   * in-progress cycle excluded). `null` when no finalized invoice exists yet
   * (`cyclesUsedForAverage` is 0).
   */
  avgPoolCreditsPerCycle: number | null;
  /** Number of finalized invoices `avgPoolCreditsPerCycle` was averaged over (0-3). */
  cyclesUsedForAverage: number;
  /**
   * Current billing cycle's bounds (ms epoch), used to derive cycle length
   * for an "on target" projection against the pool's credit exhaustion date.
   * `null` when there's no active cycle (e.g. no active Metronome contract).
   */
  currentCycleStartMs: number | null;
  currentCycleEndMs: number | null;
  /**
   * Furthest-out expiration (ms epoch) among the workspace's currently
   * active AWU pool credit grants — when the currently available pool
   * credits will lapse if left unused. `null` when there's no active grant.
   */
  latestCreditExpirationMs: number | null;
};
