import type Stripe from "stripe";

export type BillingInvoice = {
  id: string;
  number: string | null;
  status: Stripe.Invoice.Status | null;
  description: string | null;
  currency: string;
  totalCents: number;
  amountPaidCents: number;
  createdAtMs: number;
  dueDateMs: number | null;
  periodStartMs: number;
  periodEndMs: number;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
};

export type GetBillingInvoicesResponseBody = {
  billingInvoices: BillingInvoice[];
};
