// Shared contract types for the poke coupons API endpoints, imported by both
// the Next handlers under `front/pages/api/poke/coupons` and their Hono
// counterparts under `front-api/routes/poke/coupons`.
import type { CouponRedemptionType, CouponType } from "@app/types/coupon";

export type GetPokeCouponsResponseBody = {
  coupons: CouponType[];
};

export type CreatePokeCouponResponseBody = {
  coupon: CouponType;
};

export type GetPokeCouponRedemptionsResponseBody = {
  redemptions: CouponRedemptionType[];
};
