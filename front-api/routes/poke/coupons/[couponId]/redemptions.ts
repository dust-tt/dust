import { CouponRedemptionResource } from "@app/lib/resources/coupon_redemption_resource";
import { CouponResource } from "@app/lib/resources/coupon_resource";
import type { CouponRedemptionStatus } from "@app/types/coupon";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

// `redeemedAt` is a `Date` in `CouponRedemptionResource.toJSON()` but
// JSON-serializes to an ISO string on the wire; the response body type
// reflects the wire format.
export type GetPokeCouponRedemptionsResponseBody = {
  redemptions: Array<{
    sId: string;
    couponId: string;
    workspaceId: string;
    redeemedByUserId: string | null;
    redeemedAt: string;
    metronomeCreditIds: string[];
    status: CouponRedemptionStatus;
  }>;
};

// Mounted at /api/poke/coupons/:couponId/redemptions. pokeAuth is applied by
// the parent poke sub-app.
const app = pokeApp();

app.get(
  "/",
  async (ctx): HandlerResult<GetPokeCouponRedemptionsResponseBody> => {
    const couponId = ctx.req.param("couponId") ?? "";
    if (!couponId) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "coupon_not_found",
          message: "Could not find the coupon.",
        },
      });
    }

    const coupon = await CouponResource.fetchByCouponId(couponId);
    if (!coupon) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "coupon_not_found",
          message: "Could not find the coupon.",
        },
      });
    }

    const redemptions = await CouponRedemptionResource.listAllByCoupon(coupon);
    return ctx.json({
      redemptions: redemptions.map((r) => r.toJSON()),
    });
  }
);

export default app;
