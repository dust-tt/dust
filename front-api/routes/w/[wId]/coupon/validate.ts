import { CouponRedemptionResource } from "@app/lib/resources/coupon_redemption_resource";
import { CouponResource } from "@app/lib/resources/coupon_resource";
import type { CouponType } from "@app/types/coupon";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

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
    return apiError(c, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can access this endpoint.",
      },
    });
  }

  const { code } = c.req.valid("query");

  const coupon = await CouponResource.findByCode(code);
  if (!coupon) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "coupon_not_found",
        message: "Coupon not found.",
      },
    });
  }

  const validationResult = coupon.validateRedemption();
  if (validationResult.isErr()) {
    const { code: errorCode } = validationResult.error;
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "coupon_not_redeemable",
        message: `Coupon is not redeemable: ${errorCode}.`,
      },
    });
  }

  const existingRedemption =
    await CouponRedemptionResource.findActiveOrPendingByCouponAndWorkspace(
      auth,
      { coupon }
    );
  if (existingRedemption) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "coupon_already_redeemed",
        message: "This coupon has already been redeemed by this workspace.",
      },
    });
  }

  const body: GetCouponValidateResponseBody = { coupon: coupon.toJSON() };
  return c.json(body);
});

export default app;
