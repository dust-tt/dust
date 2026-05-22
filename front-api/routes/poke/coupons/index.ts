import { CouponResource } from "@app/lib/resources/coupon_resource";
import type { CouponDiscountType } from "@app/types/coupon";
import { CreateCouponBodySchema } from "@app/types/coupon";
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

app.get("/", async (ctx): HandlerResult<GetPokeCouponsResponseBody> => {
  const coupons = await CouponResource.listAll({ includeArchived: true });
  return ctx.json({
    coupons: coupons.map((coupon) => coupon.toJSON()),
  });
});

app.post(
  "/",
  validate("json", CreateCouponBodySchema),
  async (ctx): HandlerResult<CreatePokeCouponResponseBody> => {
    const auth = ctx.get("auth");
    const body = ctx.req.valid("json");

    const existing = await CouponResource.findByCode(body.code);
    if (existing) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "A coupon with this code already exists.",
        },
      });
    }

    const result = await CouponResource.makeNew(auth, body);
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to create coupon: ${result.error.message}`,
        },
      });
    }

    return ctx.json({ coupon: result.value.toJSON() }, 201);
  }
);

app.route("/:couponId", couponId);

export default app;
