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
  billingReason: Stripe.Invoice.BillingReason | null;
  description: string | null;
  currency: string;
  total: number;
  amountPaid: number;
  createdAt: number;
  dueDate: number | null;
  periodStart: number;
  periodEnd: number;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
};

export type BillingInvoicesPage = {
  invoices: BillingInvoice[];
  hasMore: boolean;
  nextCursor: string | null;
};

export type GetBillingInvoicesResponseBody = {
  billingInvoices: BillingInvoicesPage;
};

function serializeInvoice(invoice: Stripe.Invoice): BillingInvoice {
  return {
    id: invoice.id,
    number: invoice.number ?? null,
    status: invoice.status ?? null,
    billingReason: invoice.billing_reason ?? null,
    description: invoice.description ?? null,
    currency: invoice.currency,
    total: invoice.total,
    amountPaid: invoice.amount_paid,
    createdAt: invoice.created * 1000,
    dueDate: invoice.due_date ? invoice.due_date * 1000 : null,
    periodStart: invoice.period_start * 1000,
    periodEnd: invoice.period_end * 1000,
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    invoicePdf: invoice.invoice_pdf ?? null,
  };
}

export async function listWorkspaceBillingInvoices({
  auth,
  cursor,
}: {
  auth: Authenticator;
  cursor?: string;
}): Promise<Result<BillingInvoicesPage, Error>> {
  const owner = auth.workspace() ?? null;
  const subscription = auth.subscription() ?? null;

  if (!owner || !subscription || !isCreditPricedPlan(subscription.plan)) {
    return new Ok({
      invoices: [],
      hasMore: false,
      nextCursor: null,
    });
  }

  const stripeCustomerIdRes = await getBillingStripeCustomerId({
    owner,
    subscription,
  });
  if (stripeCustomerIdRes.isErr()) {
    return stripeCustomerIdRes;
  }
  if (!stripeCustomerIdRes.value) {
    return new Ok({
      invoices: [],
      hasMore: false,
      nextCursor: null,
    });
  }

  try {
    const invoices = await getStripeClient().invoices.list({
      customer: stripeCustomerIdRes.value,
      limit: BILLING_INVOICES_PAGE_SIZE,
      ...(cursor ? { starting_after: cursor } : {}),
    });

    return new Ok({
      invoices: invoices.data.map(serializeInvoice),
      hasMore: invoices.has_more,
      nextCursor: invoices.has_more
        ? (invoices.data[invoices.data.length - 1]?.id ?? null)
        : null,
    });
  } catch (error) {
    return new Err(new Error(errorToString(error)));
  }
}
