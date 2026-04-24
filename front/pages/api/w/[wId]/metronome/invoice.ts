/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { amountCents } from "@app/lib/metronome/amounts";
import { listMetronomeDraftInvoices } from "@app/lib/metronome/client";
import {
  CREDIT_TYPE_EUR_ID,
  CREDIT_TYPE_USD_ID,
  getProductMauId,
  getProductMauTierIds,
  getProductWorkspaceSeatId,
} from "@app/lib/metronome/constants";
import { apiError } from "@app/logger/withlogging";
import type { SupportedCurrency } from "@app/types/currency";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { BillingPeriod } from "@app/types/plan";
import type { NextApiRequest, NextApiResponse } from "next";

export type MetronomeInvoiceSummary = {
  currency: SupportedCurrency;
  billingPeriod: BillingPeriod;
  currentPeriodStart: number; // ms epoch
  currentPeriodEnd: number; // ms epoch
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

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetMetronomeInvoiceResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can access this endpoint.",
      },
    });
  }

  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const subscription = auth.subscription();
  const owner = auth.workspace();
  if (!subscription || !owner) {
    return res.status(200).json({ invoice: null });
  }

  const { metronomeContractId } = subscription;
  const { metronomeCustomerId } = owner;
  if (!metronomeContractId || !metronomeCustomerId) {
    return res.status(200).json({ invoice: null });
  }

  const nowMs = Date.now();

  const invoicesResult = await listMetronomeDraftInvoices(metronomeCustomerId);
  if (invoicesResult.isErr()) {
    return apiError(req, res, {
      status_code: 502,
      api_error: {
        type: "internal_server_error",
        message: `Failed to fetch Metronome draft invoices: ${invoicesResult.error.message}`,
      },
    });
  }

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

  if (!invoice || !invoice.start_timestamp || !invoice.end_timestamp) {
    return res.status(200).json({ invoice: null });
  }

  const currency = creditTypeIdToCurrency(invoice.credit_type.id);
  if (!currency) {
    return res.status(200).json({ invoice: null });
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

  const currentPeriodStart = new Date(invoice.start_timestamp).getTime();
  const currentPeriodEnd = new Date(invoice.end_timestamp).getTime();

  const summary: MetronomeInvoiceSummary = {
    currency,
    billingPeriod: inferBillingPeriod(currentPeriodStart, currentPeriodEnd),
    currentPeriodStart,
    currentPeriodEnd,
    estimatedAmountCents: amountCents(invoice.total, currency),
    mau,
    seatUnitPriceCents,
    mauUnitPriceCents,
    mauTierUnitPricesCents: tieredMauSeenOnInvoice
      ? mauTierUnitPricesCents
      : null,
  };

  return res.status(200).json({ invoice: summary });
}

export default withSessionAuthenticationForWorkspace(handler);
