import type { SupportedCurrency } from "@app/types/currency";

export type AwuPoolCycleBreakdown = {
  cycleStartMs: number | null;
  cycleEndMs: number | null;
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
  // Per-cycle pool consumption, most recent first
  cycleBreakdown: AwuPoolCycleBreakdown[];
  currentCycleConsumedCredits: number | null;
  currentCycleStartMs: number | null;
  currentCycleEndMs: number | null;
};
