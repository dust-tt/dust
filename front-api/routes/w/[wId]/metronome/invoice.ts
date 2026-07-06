import { amountCents } from "@app/lib/metronome/amounts";
import { listMetronomeDraftInvoices } from "@app/lib/metronome/client";
import {
  CREDIT_TYPE_EUR_ID,
  CREDIT_TYPE_USD_ID,
  getProductWorkspaceSeatId,
} from "@app/lib/metronome/constants";
import type {
  GetMetronomeInvoiceLinesResponseBody,
  GetMetronomeInvoiceResponseBody,
  MetronomeInvoiceLineItem,
  MetronomeInvoiceSummary,
} from "@app/lib/metronome/invoice";
import type { SupportedCurrency } from "@app/types/currency";
import type { BillingPeriod } from "@app/types/plan";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import type { Invoice } from "@metronome/sdk/resources/v1/customers";

function creditTypeIdToCurrency(
  creditTypeId: string
): SupportedCurrency | null {
  if (creditTypeId === CREDIT_TYPE_USD_ID) {
    return "usd";
  }
  if (creditTypeId === CREDIT_TYPE_EUR_ID) {
    return "eur";
  }
  return null;
}

function inferBillingPeriod(startMs: number, endMs: number): BillingPeriod {
  const spanDays = (endMs - startMs) / (1000 * 60 * 60 * 24);
  return spanDays > 60 ? "yearly" : "monthly";
}

async function findCurrentInvoice(
  metronomeCustomerId: string,
  metronomeContractId: string
): Promise<Result<Invoice | undefined, Error>> {
  const invoicesResult = await listMetronomeDraftInvoices(metronomeCustomerId);
  if (invoicesResult.isErr()) {
    return new Err(invoicesResult.error);
  }
  const nowMs = Date.now();
  const invoice = invoicesResult.value.find((inv) => {
    if (inv.contract_id !== metronomeContractId) {
      return false;
    }
    if (!inv.start_timestamp || !inv.end_timestamp) {
      return false;
    }
    const startMs = new Date(inv.start_timestamp).getTime();
    const endMs = new Date(inv.end_timestamp).getTime();
    return startMs <= nowMs && nowMs < endMs;
  });
  return new Ok(invoice);
}

// When a credit partially covers a charge, Metronome splits the charge line
// into a covered portion (fractional quantity, carrying
// applied_commit_or_credit) and the uncovered remainder. Similarly, a single
// coupon applied to several products yields one applied-credit line per
// product. Merge those splits back so the invoice reads as one line per
// charge and one line per coupon/credit.
function mergeLineItems(
  lineItems: MetronomeInvoiceLineItem[]
): MetronomeInvoiceLineItem[] {
  const merged: MetronomeInvoiceLineItem[] = [];
  const indexByKey = new Map<string, number>();
  for (const item of lineItems) {
    // Lines merge only when everything but the quantity/total matches (for
    // applied-credit lines, unit price and quantity are always null, so this
    // amounts to merging by coupon/credit name and period).
    const key = JSON.stringify([
      item.name,
      item.type,
      item.unitPriceCents,
      item.isProrated,
      item.periodStartMs,
      item.periodEndMs,
    ]);
    const index = indexByKey.get(key);
    if (index === undefined) {
      indexByKey.set(key, merged.length);
      merged.push(item);
      continue;
    }
    const existing = merged[index];
    merged[index] = {
      ...existing,
      quantity:
        existing.quantity !== null && item.quantity !== null
          ? existing.quantity + item.quantity
          : null,
      totalCents: existing.totalCents + item.totalCents,
    };
  }
  return merged;
}

// Mounted at /api/w/:wId/metronome/invoice.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetMetronomeInvoiceResponseBody> => {
    const auth = ctx.get("auth");

    const subscription = auth.subscription();
    const owner = auth.workspace();
    if (!subscription || !owner) {
      return ctx.json({ invoice: null });
    }

    const { metronomeContractId } = subscription;
    const { metronomeCustomerId } = owner;
    if (!metronomeContractId || !metronomeCustomerId) {
      return ctx.json({ invoice: null });
    }

    const invoiceResult = await findCurrentInvoice(
      metronomeCustomerId,
      metronomeContractId
    );
    if (invoiceResult.isErr()) {
      return apiError(ctx, {
        status_code: 502,
        api_error: {
          type: "internal_server_error",
          message: `Failed to fetch Metronome draft invoices: ${invoiceResult.error.message}`,
        },
      });
    }

    const invoice = invoiceResult.value;

    if (!invoice || !invoice.start_timestamp || !invoice.end_timestamp) {
      return ctx.json({ invoice: null });
    }

    const currency = creditTypeIdToCurrency(invoice.credit_type.id);
    if (!currency) {
      return ctx.json({ invoice: null });
    }

    const seatProductId = getProductWorkspaceSeatId();

    let seatUnitPriceCents: number | null = null;

    for (const item of invoice.line_items) {
      const productId = item.product_id;
      if (!productId || typeof item.unit_price !== "number") {
        continue;
      }
      if (productId === seatProductId) {
        seatUnitPriceCents = amountCents(item.unit_price, currency);
      }
    }

    const currentPeriodStartMs = new Date(invoice.start_timestamp).getTime();
    const currentPeriodEndMs = new Date(invoice.end_timestamp).getTime();

    const summary: MetronomeInvoiceSummary = {
      currency,
      billingPeriod: inferBillingPeriod(
        currentPeriodStartMs,
        currentPeriodEndMs
      ),
      currentPeriodStartMs,
      currentPeriodEndMs,
      estimatedAmountCents: amountCents(invoice.total, currency),
      seatUnitPriceCents,
    };

    return ctx.json({ invoice: summary });
  }
);

/** @ignoreswagger */
app.get(
  "/lines",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetMetronomeInvoiceLinesResponseBody> => {
    const auth = ctx.get("auth");

    const subscription = auth.subscription();
    const owner = auth.workspace();
    if (!subscription || !owner) {
      return ctx.json({ currency: null, lineItems: [] });
    }

    const { metronomeContractId } = subscription;
    const { metronomeCustomerId } = owner;
    if (!metronomeContractId || !metronomeCustomerId) {
      return ctx.json({ currency: null, lineItems: [] });
    }

    const invoiceResult = await findCurrentInvoice(
      metronomeCustomerId,
      metronomeContractId
    );
    if (invoiceResult.isErr()) {
      return apiError(ctx, {
        status_code: 502,
        api_error: {
          type: "internal_server_error",
          message: `Failed to fetch Metronome draft invoices: ${invoiceResult.error.message}`,
        },
      });
    }

    const invoice = invoiceResult.value;

    if (!invoice) {
      return ctx.json({ currency: null, lineItems: [] });
    }

    const currency = creditTypeIdToCurrency(invoice.credit_type.id);

    const mappedLineItems = invoice.line_items
      .filter((item) => {
        const itemCurrency = creditTypeIdToCurrency(item.credit_type.id);
        return !!currency && !!itemCurrency && itemCurrency === currency;
      })
      // Keep negative lines: applied commits/credits (coupons, free credits,
      // commitments) explain why the invoice total is lower than the sum of
      // the charge lines. Only drop sub-cent noise.
      .filter((item) => Math.abs(item.total) >= 0.01)
      .map((item) => {
        const itemCurrency = creditTypeIdToCurrency(item.credit_type.id);
        return {
          name: item.name,
          type: item.type,
          quantity: typeof item.quantity === "number" ? item.quantity : null,
          unitPriceCents:
            typeof item.unit_price === "number" && itemCurrency
              ? amountCents(item.unit_price, itemCurrency)
              : null,
          totalCents: itemCurrency
            ? amountCents(item.total, itemCurrency)
            : item.total,
          isProrated: item.is_prorated ?? false,
          periodStartMs: item.starting_at
            ? new Date(item.starting_at).getTime()
            : null,
          // Exclusive end of the period covered by the line item.
          periodEndMs: item.ending_before
            ? new Date(item.ending_before).getTime()
            : null,
        };
      });

    return ctx.json({ currency, lineItems: mergeLineItems(mappedLineItems) });
  }
);

export default app;
