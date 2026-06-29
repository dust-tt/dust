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

export type MetronomeInvoiceLineItem = {
  name: string;
  type: string;
  quantity: number | null;
  unitPriceCents: number | null;
  totalCents: number;
};

export type GetMetronomeInvoiceLinesResponseBody = {
  currency: SupportedCurrency | null;
  lineItems: MetronomeInvoiceLineItem[];
};
