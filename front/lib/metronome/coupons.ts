import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import type { Authenticator } from "@app/lib/auth";
import { metronomeAmount } from "@app/lib/metronome/amounts";
import {
  ceilToHourISO,
  createMetronomeCredit,
  floorToHourISO,
  getMetronomeRateCardById,
  updateMetronomeCreditEndDate,
} from "@app/lib/metronome/client";
import {
  CURRENCY_TO_CREDIT_TYPE_ID,
  getProductSeatSubscriptionCreditsId,
  getProductWorkspaceSeatId,
} from "@app/lib/metronome/constants";
import type { CachedContract } from "@app/lib/metronome/plan_type";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import { CouponRedemptionResource } from "@app/lib/resources/coupon_redemption_resource";
import type {
  CouponResource,
  CouponValidationError,
} from "@app/lib/resources/coupon_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import type { CouponDiscountType } from "@app/types/coupon";
import type { SupportedCurrency } from "@app/types/currency";
import { isSupportedCurrency } from "@app/types/currency";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { addMonths } from "date-fns";

export async function getCreditTypeFromContract(
  contract: CachedContract
): Promise<
  Result<{ creditTypeId: string; currency: SupportedCurrency }, Error>
> {
  if (!contract.rate_card_id) {
    return new Err(new Error("Contract has no rate_card_id"));
  }
  const result = await getMetronomeRateCardById({
    rateCardId: contract.rate_card_id,
  });
  if (result.isErr()) {
    return result;
  }

  const fiat_credit_type_id = result.value.fiat_credit_type?.id;
  if (!fiat_credit_type_id) {
    return new Err(new Error("Rate card has no fiat_credit_type_id"));
  }
  const creditTypeIdToCurrency = Object.fromEntries(
    Object.entries(CURRENCY_TO_CREDIT_TYPE_ID).map(([c, id]) => [id, c])
  );
  const currency = creditTypeIdToCurrency[fiat_credit_type_id];
  if (!isSupportedCurrency(currency)) {
    return new Err(
      new Error(
        `Unsupported currency for credit type id: ${fiat_credit_type_id}`
      )
    );
  }
  return new Ok({ creditTypeId: fiat_credit_type_id, currency });
}

function getApplicableProductIdsForDiscountType(
  discountType: CouponDiscountType
): string[] {
  switch (discountType) {
    case "seat":
      return [getProductWorkspaceSeatId()];
    default:
      return assertNever(discountType);
  }
}

export async function createCouponCredit({
  metronomeCustomerId,
  coupon,
  redemptionId,
  redeemedAt,
  creditTypeId,
  currency,
}: {
  metronomeCustomerId: string;
  coupon: CouponResource;
  redemptionId: string;
  redeemedAt: Date;
  creditTypeId: string;
  currency: SupportedCurrency;
}): Promise<Result<string[], Error>> {
  const scheduleItems =
    coupon.durationMonths === null
      ? [{ startingAt: redeemedAt, endingBefore: addMonths(redeemedAt, 1) }]
      : Array.from({ length: coupon.durationMonths }, (_, i) => ({
          startingAt: addMonths(redeemedAt, i),
          endingBefore: addMonths(redeemedAt, i + 1),
        }));

  const creditIds: string[] = [];

  for (let i = 0; i < scheduleItems.length; i++) {
    const item = scheduleItems[i];
    const result = await createMetronomeCredit({
      metronomeCustomerId,
      productId: getProductSeatSubscriptionCreditsId(),
      creditTypeId,
      amount: metronomeAmount(coupon.amount * 100, currency),
      startingAt: floorToHourISO(item.startingAt),
      endingBefore: ceilToHourISO(item.endingBefore),
      name: `Coupon: ${coupon.code}`,
      idempotencyKey: `coupon-${redemptionId}-${i}`,
      priority: 0,
      applicableProductIds: getApplicableProductIdsForDiscountType(
        coupon.discountType
      ),
    });

    if (result.isErr()) {
      return new Err(result.error);
    }

    if (result.value !== null) {
      creditIds.push(result.value.id);
    }
  }

  return new Ok(creditIds);
}

export async function endCouponCredit({
  metronomeCustomerId,
  metronomeCreditIds,
  endAt,
}: {
  metronomeCustomerId: string;
  metronomeCreditIds: string[];
  endAt: Date;
}): Promise<Result<void, Error>> {
  const accessEndingBefore = ceilToHourISO(endAt);

  for (const creditId of metronomeCreditIds) {
    const result = await updateMetronomeCreditEndDate({
      metronomeCustomerId,
      creditId,
      accessEndingBefore,
    });
    if (result.isErr()) {
      return result;
    }
  }

  return new Ok(undefined);
}

export type RedeemCouponError =
  | { code: "workspace_not_on_metronome" }
  | { code: "coupon_validation_failed"; reason: CouponValidationError };

export async function redeemCoupon(
  auth: Authenticator,
  { coupon }: { coupon: CouponResource }
): Promise<Result<CouponRedemptionResource, RedeemCouponError | Error>> {
  const validation = coupon.validateRedemption();
  if (validation.isErr()) {
    return new Err({
      code: "coupon_validation_failed",
      reason: validation.error,
    });
  }

  const workspace = auth.getNonNullableWorkspace();
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return new Err({ code: "workspace_not_on_metronome" });
  }

  const existingRedemption =
    await CouponRedemptionResource.findActiveOrPendingByCouponAndWorkspace(
      auth,
      { coupon }
    );
  if (existingRedemption) {
    return new Err({
      code: "coupon_validation_failed",
      reason: { code: "already_redeemed" },
    });
  }

  const contract = await getActiveContract(workspace.sId);
  if (!contract) {
    return new Err(
      new Error("No active Metronome contract found for workspace")
    );
  }

  const creditTypeIdResult = await getCreditTypeFromContract(contract);
  if (creditTypeIdResult.isErr()) {
    return creditTypeIdResult;
  }
  const { creditTypeId, currency } = creditTypeIdResult.value;
  logger.info(
    { creditTypeId, currency, workspaceId: workspace.sId },
    "[Metronome] Resolved credit type for coupon redemption"
  );

  let redemption: CouponRedemptionResource;
  try {
    redemption = await withTransaction(async (transaction) => {
      const r = await CouponRedemptionResource.makeNew(
        auth,
        { coupon },
        { transaction }
      );
      await coupon.incrementRedemptionCount({ transaction });
      return r;
    });
  } catch (err) {
    return new Err(normalizeError(err));
  }

  const creditResult = await createCouponCredit({
    metronomeCustomerId,
    coupon,
    redemptionId: redemption.sId,
    redeemedAt: redemption.redeemedAt,
    creditTypeId,
    currency,
  });

  if (creditResult.isErr()) {
    await coupon.decrementRedemptionCount();
    await redemption.markFailed();
    logger.error(
      {
        err: creditResult.error,
        couponId: coupon.sId,
        workspaceId: workspace.sId,
      },
      "[Metronome] Failed to create coupon credit — redemption marked failed"
    );
    return new Err(creditResult.error);
  }

  await redemption.markActive(creditResult.value);

  void emitAuditLogEvent({
    auth,
    action: "coupon.redeemed",
    targets: [buildAuditLogTarget("workspace", workspace)],
    metadata: {
      code: coupon.code,
      redemption_id: redemption.sId,
      amount: String(coupon.amount),
    },
  });

  return new Ok(redemption);
}

export async function revokeCouponRedemption(
  auth: Authenticator,
  { redemption }: { redemption: CouponRedemptionResource }
): Promise<Result<void, Error>> {
  const workspace = auth.getNonNullableWorkspace();
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return new Err(new Error("Workspace has no Metronome customer ID"));
  }

  const endResult = await endCouponCredit({
    metronomeCustomerId,
    metronomeCreditIds: redemption.metronomeCreditIds,
    endAt: new Date(),
  });
  if (endResult.isErr()) {
    return endResult;
  }

  const revokeResult = await redemption.markRevoked();
  if (revokeResult.isErr()) {
    return revokeResult;
  }

  void emitAuditLogEvent({
    auth,
    action: "coupon.revoked",
    targets: [buildAuditLogTarget("workspace", workspace)],
    metadata: {
      redemption_id: redemption.sId,
    },
  });

  return new Ok(undefined);
}
