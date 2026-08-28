import type { SupportedCurrency } from "@app/types/currency";

export type AwuPoolCycleBreakdown = {
  /** Billing cycle bounds (ms epoch) this figure was computed over. */
  cycleStartMs: number | null;
  cycleEndMs: number | null;
  /** Pool credits consumed during that cycle. */
  consumedCredits: number;
};

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
   * Per-cycle pool consumption, most recent first — up to the last 5
   * finalized billing cycles that had non-zero pool consumption.
   */
  cycleBreakdown: AwuPoolCycleBreakdown[];
  /**
   * Elapsed pool consumption for the current, in-progress billing cycle,
   * read from Metronome's draft invoice for it. `null` when there's no
   * active cycle (e.g. no active Metronome contract).
   */
  currentCycleConsumedCredits: number | null;
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
