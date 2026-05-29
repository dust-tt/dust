import type { Authenticator } from "@app/lib/auth";
import {
  AWU_PRICE_PER_CREDIT,
  metronomeAmount,
} from "@app/lib/metronome/amounts";
import { getCreditTypeFromContract } from "@app/lib/metronome/coupons";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import logger from "@app/logger/logger";
import type { SupportedCurrency } from "@app/types/currency";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

import { MAX_AWU_DISCOUNT_PERCENT } from "./awu_purchase_constants";

/**
 * Resolves the AWU discount from the workspace's credit usage
 * configuration. AWU has its own discount cap (`MAX_AWU_DISCOUNT_PERCENT`)
 * — distinct from the programmatic `MAX_DISCOUNT_PERCENT` — because the
 * per-credit economics differ. A misconfigured discount above the cap is
 * dropped and logged rather than honoured.
 */
export async function resolveAwuPurchaseDiscountPercent(
  auth: Authenticator
): Promise<number> {
  const creditConfig =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
  const discountPercent = creditConfig?.defaultDiscountPercent ?? 0;

  if (discountPercent <= 0) {
    return 0;
  }

  if (discountPercent > MAX_AWU_DISCOUNT_PERCENT) {
    logger.error(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        discountPercent,
        maxAwuDiscountPercent: MAX_AWU_DISCOUNT_PERCENT,
      },
      "[AWU Discount] Discount exceeds AWU maximum allowed — ignoring"
    );
    return 0;
  }

  return discountPercent;
}

/**
 * Resolves the billing currency from the active Metronome contract's rate
 * card — the source of truth for Metronome-billed workspaces. The Stripe
 * customer's `currency` field is unreliable (only set after the first paid
 * invoice) and its `address.country` may not be populated, so deriving
 * currency from the contract guarantees the invoice matches what Metronome
 * is configured to bill.
 */
export async function resolveAwuPurchaseCurrency(
  workspaceId: string
): Promise<Result<SupportedCurrency, Error>> {
  const contract = await getActiveContract(workspaceId);
  if (!contract) {
    return new Err(new Error("No active Metronome contract found"));
  }
  const creditTypeResult = await getCreditTypeFromContract(contract);
  if (creditTypeResult.isErr()) {
    return new Err(creditTypeResult.error);
  }
  return new Ok(creditTypeResult.value.currency);
}

/**
 * Compute the per-credit invoice unit price for an AWU commit/purchase, in
 * Metronome's fiat unit for the workspace's billing currency.
 *
 * We bill the full grant as a single invoice line (`quantity = 1`,
 * `unit_price = totalInvoiceCents`) rather than per-credit. With a discount
 * the per-credit price would be sub-cent (e.g. 0.77¢ at 23% USD) and
 * `metronomeAmount` rounds USD to integer cents, which would silently
 * swallow the discount on small purchases. Collapsing to a single line
 * keeps `metronomeAmount` working as designed — sub-cent rounding only
 * applies to the total, where it's negligible.
 *
 * `Math.round` to whole cents BEFORE handing to `metronomeAmount`:
 * `metronomeAmount` rounds USD but not EUR (it just divides by 100), so a
 * fractional input like 999.891 cents would surface on the
 * Stripe / Metronome invoice as €9.99891 instead of €10.00.
 */
export function computeAwuInvoiceUnitPrice({
  amountCredits,
  currency,
  discountPercent,
}: {
  amountCredits: number;
  currency: SupportedCurrency;
  discountPercent: number;
}): number {
  const discountMultiplier = 1 - discountPercent / 100;
  const totalInvoiceCents = Math.round(
    amountCredits * AWU_PRICE_PER_CREDIT[currency] * 100 * discountMultiplier
  );
  return metronomeAmount(totalInvoiceCents, currency);
}
