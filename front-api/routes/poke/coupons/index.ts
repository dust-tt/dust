import {
  canCreateCoupon,
  createCouponAndPushToOtherRegion,
} from "@app/lib/api/poke/coupons";
import { CouponResource } from "@app/lib/resources/coupon_resource";
import type { CouponDiscountType } from "@app/types/coupon";
import { CreateCouponBodySchema } from "@app/types/coupon";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

import couponId from "./[couponId]";

// `expirationDate` and `archivedAt` are `Date | null` in
// `CouponResource.toJSON()` but JSON-serialize to ISO strings on the wire;
// the response body type reflects the wire format. Consumers (e.g.
// `CouponsPage`) already pass them through `new Date(...)` / `!!field`, so
// the string form is compatible.
type PokeCouponWireShape = {
  sId: string;
  code: string;
  description: string | null;
  discountType: CouponDiscountType;
  amount: number;
  durationMonths: number | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  expirationDate: string | null;
  archivedAt: string | null;
};

export type GetPokeCouponsResponseBody = {
  coupons: PokeCouponWireShape[];
};

export type CreatePokeCouponResponseBody = {
  coupon: PokeCouponWireShape;
};

// Mounted at /api/poke/coupons. pokeAuth is applied by the parent poke
// sub-app.
const app = pokeApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetPokeCouponsResponseBody> => {
  const coupons = await CouponResource.listAll({ includeArchived: true });
  return ctx.json({
    coupons: coupons.map((coupon) => coupon.toJSON()),
    canCreateCoupon: canCreateCoupon(),
  });
});

app.post(
  "/",
  validate("json", CreateCouponBodySchema),
  async (ctx): HandlerResult<CreatePokeCouponResponseBody> => {
    const auth = ctx.get("auth");
    const body = ctx.req.valid("json");

    if (!canCreateCoupon()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Coupons can only be created from the main region (US). " +
            "Switch the Poke region to US and retry.",
        },
      });
    }

    const result = await createCouponAndPushToOtherRegion(auth, body);
    if (result.isErr()) {
      switch (result.error.type) {
        case "coupon_already_exists":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "A coupon with this code already exists.",
            },
          });
        case "creation_failed":
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: `Failed to create coupon: ${result.error.message}`,
            },
          });
        case "sync_failed":
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message:
                "Coupon was created but failed to sync to the other region. " +
                "The coupon has been deleted. Please try again.",
            },
          });
        default:
          assertNever(result.error);
      }
    }

    return ctx.json({ coupon: result.value.toJSON() }, 201);
  }
);

app.route("/:couponId", couponId);

export default app;
