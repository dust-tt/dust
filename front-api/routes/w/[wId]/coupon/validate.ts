import { CouponRedemptionResource } from "@app/lib/resources/coupon_redemption_resource";
import { CouponResource } from "@app/lib/resources/coupon_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type { GetCouponValidateResponseBody } from "@app/lib/resources/coupon_resource";

const GetCouponValidateQuerySchema = z.object({
  code: z.string(),
});

// Mounted at /api/w/:wId/coupon/validate.
const app = workspaceApp();

app.get(
  "/",
  ensureIsAdmin(),
  validate("query", GetCouponValidateQuerySchema),
  async (ctx) => {
    const auth = ctx.get("auth");

    const { code } = ctx.req.valid("query");

    const coupon = await CouponResource.findByCode(code);
    if (!coupon) {
      return apiError(ctx, {
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
      return apiError(ctx, {
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
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "coupon_already_redeemed",
          message: "This coupon has already been redeemed by this workspace.",
        },
      });
    }

    return ctx.json({ coupon: coupon.toJSON() });
  }
);

export default app;
