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
  /**
   * Live, Elasticsearch-derived total AWU consumption for the current
   * billing cycle, summed across every member — the same figure the members
   * table's "Credits usage" column shows per row. Only computed for
   * workspaces with no active credit pool (`totalActiveCredits <= 0`), where
   * there's no pool ledger to read `currentCycleConsumedCredits` from and all
   * consumption is PAYG excess. `null` for pool workspaces, or when the
   * analytics read failed.
   */
  excessConsumedCredits: number | null;
  /**
   * Per-cycle PAYG excess consumption, most recent first — up to the last 5
   * finalized billing cycles with non-zero excess, read from each invoice's
   * `cpu_conversion` line items. A fallback history for workspaces with no
   * credit pool, where `cycleBreakdown` (pool-ledger based) is always empty.
   */
  excessCycleBreakdown: AwuPoolCycleBreakdown[];
};
