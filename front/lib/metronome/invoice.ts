import type { SupportedCurrency } from "@app/types/currency";
import type { BillingPeriod } from "@app/types/plan";

export type MetronomeInvoiceSummary = {
  currency: SupportedCurrency;
  billingPeriod: BillingPeriod;
  currentPeriodStartMs: number;
  currentPeriodEndMs: number;
  estimatedAmountCents: number;
  mau: number | null;
  /** Pro: effective per-seat unit price from the seat line item. */
  seatUnitPriceCents: number | null;
  /** Enterprise simple MAU: effective unit price from the MAU line item. */
  mauUnitPriceCents: number | null;
  /**
   * Enterprise tiered MAU: effective per-tier unit prices, indexed by tier
   * position (same order as getProductMauTierIds()). `null` at a position
   * means that tier is not present on this contract / not charged this period.
   */
  mauTierUnitPricesCents: Array<number | null> | null;
};

export type GetMetronomeInvoiceResponseBody = {
  invoice: MetronomeInvoiceSummary | null;
};
