import type { Authenticator } from "@app/lib/auth";
import {
  getBillingStripeCustomerId,
  getStripeClient,
} from "@app/lib/plans/stripe";
import { isCreditPricedPlan } from "@app/types/plan";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { errorToString } from "@app/types/shared/utils/error_utils";
import type Stripe from "stripe";

const BILLING_INVOICES_PAGE_SIZE = 12;

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

function serializeInvoice(invoice: Stripe.Invoice): BillingInvoice {
  return {
    id: invoice.id,
    number: invoice.number ?? null,
    status: invoice.status ?? null,
    description: invoice.description ?? null,
    currency: invoice.currency,
    totalCents: invoice.total,
    amountPaidCents: invoice.amount_paid,
    createdAtMs: invoice.created * 1000,
    dueDateMs: invoice.due_date ? invoice.due_date * 1000 : null,
    periodStartMs: invoice.period_start * 1000,
    periodEndMs: invoice.period_end * 1000,
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    invoicePdf: invoice.invoice_pdf ?? null,
  };
}

export async function listRecentBillingInvoices(
  auth: Authenticator
): Promise<Result<BillingInvoice[], Error>> {
  const owner = auth.workspace() ?? null;
  const subscription = auth.subscription() ?? null;

  if (!owner || !subscription || !isCreditPricedPlan(subscription.plan)) {
    return new Ok([]);
  }

  const stripeCustomerIdRes = await getBillingStripeCustomerId({
    owner,
    subscription,
  });
  if (stripeCustomerIdRes.isErr()) {
    return stripeCustomerIdRes;
  }
  if (!stripeCustomerIdRes.value) {
    return new Ok([]);
  }

  try {
    const invoices = await getStripeClient().invoices.list({
      customer: stripeCustomerIdRes.value,
      limit: BILLING_INVOICES_PAGE_SIZE,
    });

    return new Ok(invoices.data.map(serializeInvoice));
  } catch (error) {
    return new Err(new Error(errorToString(error)));
  }
}
