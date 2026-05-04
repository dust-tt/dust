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
import type { CouponResource } from "@app/lib/resources/coupon_resource";
import type { CouponDiscountType } from "@app/types/coupon";
import type { SupportedCurrency } from "@app/types/currency";
import { isSupportedCurrency } from "@app/types/currency";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
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
