import { config } from "@app/lib/api/regions/config";
import type { Authenticator } from "@app/lib/auth";
import { CouponResource } from "@app/lib/resources/coupon_resource";
import logger from "@app/logger/logger";
import type { CouponType, CreateCouponBody } from "@app/types/coupon";
import { isDevelopment } from "@app/types/shared/env";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export function canCreateCoupon(): boolean {
  return config.isMainRegion() || isDevelopment();
}

export type CreateCouponError =
  | { type: "coupon_already_exists" }
  | { type: "creation_failed"; message: string }
  | { type: "sync_failed" };

export async function createCouponAndPushToOtherRegion(
  auth: Authenticator,
  body: CreateCouponBody
): Promise<Result<CouponResource, CreateCouponError>> {
  const existing = await CouponResource.findByCode(body.code);
  if (existing) {
    return new Err({ type: "coupon_already_exists" });
  }

  const result = await CouponResource.makeNew(auth, body);
  if (result.isErr()) {
    return new Err({ type: "creation_failed", message: result.error.message });
  }

  const coupon = result.value;

  const pushResult = await pushCouponToOtherRegion(coupon.toJSON());
  if (pushResult.isErr()) {
    logger.error(
      { couponId: coupon.sId },
      "[CouponSync] Failed to sync coupon to other region — rolling back local creation"
    );
    await coupon.delete(auth);
    return new Err({ type: "sync_failed" });
  }

  return new Ok(coupon);
}

export type PushCouponError = "other_region_push_failed";

export async function pushCouponToOtherRegion(
  coupon: CouponType
): Promise<Result<void, PushCouponError>> {
  if (isDevelopment()) {
    return new Ok(undefined);
  }

  const { url } = config.getOtherRegionInfo();
  const secret = config.getLookupApiSecret();

  // eslint-disable-next-line no-restricted-globals
  const response = await fetch(`${url}/api/lookup/coupons/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(coupon),
  });

  if (!response.ok) {
    logger.error(
      { status: response.status, couponId: coupon.sId },
      "[CouponSync] Failed to push coupon to other region"
    );
    return new Err("other_region_push_failed");
  }

  return new Ok(undefined);
}
