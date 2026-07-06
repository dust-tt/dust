import type { SupportedCurrency } from "@app/types/currency";
import type { BillingPeriod } from "@app/types/plan";

export type MetronomeInvoiceSummary = {
  currency: SupportedCurrency;
  billingPeriod: BillingPeriod;
  currentPeriodStartMs: number;
  currentPeriodEndMs: number;
  estimatedAmountCents: number;
  /** Pro: effective per-seat unit price from the seat line item. */
  seatUnitPriceCents: number | null;
};

export type GetMetronomeInvoiceResponseBody = {
  invoice: MetronomeInvoiceSummary | null;
};

/**
 * Metronome line item type for an applied commit or credit (coupon, free
 * credits, commitment): a negative line that offsets the charge lines above
 * it and explains a discounted invoice total.
 */
export const APPLIED_COMMIT_OR_CREDIT_LINE_TYPE = "applied_commit_or_credit";

export function isAppliedCreditLineItem(
  item: MetronomeInvoiceLineItem
): boolean {
  return item.type === APPLIED_COMMIT_OR_CREDIT_LINE_TYPE;
}

export type MetronomeInvoiceLineItem = {
  name: string;
  type: string;
  quantity: number | null;
  unitPriceCents: number | null;
  totalCents: number;
  /** Whether the line item is prorated (partial billing period). */
  isProrated?: boolean;
  /** Start of the period covered by the line item. */
  periodStartMs?: number | null;
  /** Exclusive end of the period covered by the line item. */
  periodEndMs?: number | null;
};

export type GetMetronomeInvoiceLinesResponseBody = {
  currency: SupportedCurrency | null;
  lineItems: MetronomeInvoiceLineItem[];
};
