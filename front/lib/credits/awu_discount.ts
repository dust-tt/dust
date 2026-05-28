import type { Authenticator } from "@app/lib/auth";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import logger from "@app/logger/logger";

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
