import type { Authenticator } from "@app/lib/auth";
import {
  getBillingStripeCustomerId,
  getStripeClient,
} from "@app/lib/plans/stripe";
import type { BillingInvoice } from "@app/types/api/billing/invoices";
import { isCreditPricedPlan } from "@app/types/plan";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { errorToString } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import type Stripe from "stripe";

const BILLING_INVOICES_PAGE_SIZE = 12;
// A Stripe customer can be shared by multiple workspaces (several Metronome
// customers can point to the same Stripe customer). We list more invoices than
// we display so that filtering by workspace still fills a page.
const BILLING_INVOICES_SCAN_LIMIT = 100;

function serializeInvoice(invoice: Stripe.Invoice): BillingInvoice {
  return {
    id: invoice.id,
    number: invoice.number ?? null,
    status: invoice.status ?? null,
    description: invoice.description ?? null,
    currency: invoice.currency,
    totalCents: invoice.total,
    // `total_excluding_tax` is null when Stripe computed no tax on the
    // invoice, in which case `total` is already tax-free.
    totalExcludingTaxCents: invoice.total_excluding_tax ?? invoice.total,
    amountPaidCents: invoice.amount_paid,
    createdAtMs: invoice.created * 1000,
    dueDateMs: invoice.due_date ? invoice.due_date * 1000 : null,
    periodStartMs: invoice.period_start * 1000,
    periodEndMs: invoice.period_end * 1000,
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    invoicePdf: invoice.invoice_pdf ?? null,
  };
}

// A Stripe customer can be shared by several workspaces (multiple Metronome
// customers pointing to the same Stripe customer), so listing by customer is
// not enough. An invoice is excluded only when an attribution marker
// positively ties it to a *different* workspace, checked in the same
// precedence order as the Stripe webhook handler (`resolveInvoiceCtx`):
//   - `metadata.workspace_id` — stamped on credit-purchase invoices we create.
//   - `metadata.metronome_customer_id` — stamped by Metronome on every invoice
//     it pushes to Stripe.
//   - `subscription_details.metadata.workspaceId` — stamped on the Stripe
//     subscription at checkout, snapshotted on its invoices by Stripe.
// Legacy invoices (pre-Metronome, or created manually in Stripe) carry no
// marker at all: we keep them rather than hide the workspace's own history.
function invoiceBelongsToAnotherWorkspace({
  invoice,
  owner,
}: {
  invoice: Stripe.Invoice;
  owner: LightWorkspaceType;
}): boolean {
  if (invoice.metadata?.workspace_id) {
    return invoice.metadata.workspace_id !== owner.sId;
  }
  if (invoice.metadata?.metronome_customer_id) {
    return invoice.metadata.metronome_customer_id !== owner.metronomeCustomerId;
  }
  const subscriptionWorkspaceId =
    invoice.subscription_details?.metadata?.workspaceId;
  if (subscriptionWorkspaceId) {
    return subscriptionWorkspaceId !== owner.sId;
  }
  return false;
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
      limit: BILLING_INVOICES_SCAN_LIMIT,
    });

    return new Ok(
      invoices.data
        .filter(
          (invoice) => !invoiceBelongsToAnotherWorkspace({ invoice, owner })
        )
        .slice(0, BILLING_INVOICES_PAGE_SIZE)
        .map(serializeInvoice)
    );
  } catch (error) {
    return new Err(new Error(errorToString(error)));
  }
}
