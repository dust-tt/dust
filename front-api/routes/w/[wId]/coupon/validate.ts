import { Hono } from "hono";
import { z } from "zod";

import { CouponRedemptionResource } from "@app/lib/resources/coupon_redemption_resource";
import { CouponResource } from "@app/lib/resources/coupon_resource";
import type { CouponType } from "@app/types/coupon";

import { validate } from "@front-api/middleware/validator";

export type GetCouponValidateResponseBody = {
  coupon: CouponType;
};

const GetCouponValidateQuerySchema = z.object({
  code: z.string(),
});

// Mounted at /api/w/:wId/coupon/validate.
const app = new Hono();

app.get("/", validate("query", GetCouponValidateQuerySchema), async (c) => {
  const auth = c.get("auth");

  if (!auth.isAdmin()) {
    return c.json(
      {
        error: {
          type: "workspace_auth_error",
          message:
            "Only users that are `admins` for the current workspace can access this endpoint.",
        },
      },
      403
    );
  }

  const { code } = c.req.valid("query");

  const coupon = await CouponResource.findByCode(code);
  if (!coupon) {
    return c.json(
      {
        error: {
          type: "coupon_not_found",
          message: "Coupon not found.",
        },
      },
      404
    );
  }

  const validationResult = coupon.validateRedemption();
  if (validationResult.isErr()) {
    const { code: errorCode } = validationResult.error;
    return c.json(
      {
        error: {
          type: "coupon_not_redeemable",
          message: `Coupon is not redeemable: ${errorCode}.`,
        },
      },
      400
    );
  }

  const existingRedemption =
    await CouponRedemptionResource.findActiveOrPendingByCouponAndWorkspace(
      auth,
      { coupon }
    );
  if (existingRedemption) {
    return c.json(
      {
        error: {
          type: "coupon_already_redeemed",
          message: "This coupon has already been redeemed by this workspace.",
        },
      },
      400
    );
  }

  const body: GetCouponValidateResponseBody = { coupon: coupon.toJSON() };
  return c.json(body);
});

export default app;
