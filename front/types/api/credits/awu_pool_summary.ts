import type { SupportedCurrency } from "@app/types/currency";

export type AwuPoolCycleBreakdown = {
  cycleStartMs: number | null;
  cycleEndMs: number | null;
  consumedCredits: number;
};

// Current-cycle figures only — cheap to compute (bounded ledger lookup),
// meant to render before cycle history is available.
export type AwuPoolCurrentCycleResponseBody = {
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
  currentCycleConsumedCredits: number | null;
  currentCycleStartMs: number | null;
  currentCycleEndMs: number | null;
  // PAYG credits
  excessConsumedCredits: number | null;
  programmaticConsumedCredits: number | null;
};

// Whether older cycles with consumption exist beyond the returned ones, per breakdown — only
// one of the two breakdowns is ever rendered for a given workspace, so callers must check the
// flag matching the breakdown they display rather than OR-ing the two together.
export type AwuPoolCycleHistoryOverflow = {
  cycleBreakdown: boolean;
  excessCycleBreakdown: boolean;
};

/**
 * @cc [owner:avervaet,label:api] hasMoreCycleHistory-stays-boolean
 * `hasMoreCycleHistory` MUST remain a plain `boolean` (true if either breakdown has more), never
 * an object, so that a client bundle predating `hasMoreCycleHistoryByBreakdown` keeps reading a
 * boolean rather than a truthy object that would leave its "Load more" control always enabled.
 * Per-breakdown detail belongs in `hasMoreCycleHistoryByBreakdown` instead. Remove this contract
 * and `hasMoreCycleHistory` together once old clients are confirmed cycled out.
 */
export type AwuPoolCycleHistoryResponseBody = {
  // Per-cycle pool consumption, most recent first
  cycleBreakdown: AwuPoolCycleBreakdown[];
  excessCycleBreakdown: AwuPoolCycleBreakdown[];
  // Deprecated: true if either breakdown has more. Kept for backward compatibility with clients
  // predating `hasMoreCycleHistoryByBreakdown`.
  hasMoreCycleHistory: boolean;
  hasMoreCycleHistoryByBreakdown: AwuPoolCycleHistoryOverflow;
};

export type AwuPoolSummaryResponseBody = AwuPoolCurrentCycleResponseBody &
  AwuPoolCycleHistoryResponseBody;
