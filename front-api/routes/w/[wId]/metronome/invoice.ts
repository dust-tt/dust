import { amountCents } from "@app/lib/metronome/amounts";
import { listMetronomeDraftInvoices } from "@app/lib/metronome/client";
import {
  CREDIT_TYPE_EUR_ID,
  CREDIT_TYPE_USD_ID,
  getProductMauId,
  getProductMauTierIds,
  getProductWorkspaceSeatId,
} from "@app/lib/metronome/constants";
import type {
  GetMetronomeInvoiceLinesResponseBody,
  GetMetronomeInvoiceResponseBody,
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
    const simpleMauProductId = getProductMauId();
    const tierProductIds = getProductMauTierIds();
    const tierProductIdToIndex = new Map<string, number>(
      tierProductIds.map((id, idx) => [id, idx])
    );

    const mauProductIds = new Set<string>([
      simpleMauProductId,
      ...tierProductIds,
    ]);

    let mau: number | null = null;
    let seatUnitPriceCents: number | null = null;
    let mauUnitPriceCents: number | null = null;
    const mauTierUnitPricesCents: Array<number | null> = tierProductIds.map(
      () => null
    );
    let tieredMauSeenOnInvoice = false;

    for (const item of invoice.line_items) {
      const productId = item.product_id;
      if (!productId) {
        continue;
      }

      if (mauProductIds.has(productId) && typeof item.quantity === "number") {
        mau = (mau ?? 0) + item.quantity;
      }

      if (typeof item.unit_price !== "number") {
        continue;
      }

      if (productId === seatProductId) {
        seatUnitPriceCents = amountCents(item.unit_price, currency);
      } else if (productId === simpleMauProductId) {
        mauUnitPriceCents = amountCents(item.unit_price, currency);
      } else {
        const tierIndex = tierProductIdToIndex.get(productId);
        if (tierIndex !== undefined) {
          mauTierUnitPricesCents[tierIndex] = amountCents(
            item.unit_price,
            currency
          );
          tieredMauSeenOnInvoice = true;
        }
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
      mau,
      seatUnitPriceCents,
      mauUnitPriceCents,
      mauTierUnitPricesCents: tieredMauSeenOnInvoice
        ? mauTierUnitPricesCents
        : null,
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

    const lineItems = invoice.line_items
      .filter((item) => {
        const itemCurrency = creditTypeIdToCurrency(item.credit_type.id);
        return !!currency && !!itemCurrency && itemCurrency === currency;
      })
      .filter((item) => item.total >= 0.01)
      .filter((item) => !item.applied_commit_or_credit)
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
        };
      });

    return ctx.json({ currency, lineItems, items: invoice.line_items });
  }
);

export default app;
