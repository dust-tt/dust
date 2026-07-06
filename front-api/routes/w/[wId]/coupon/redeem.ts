import { redeemPoolTopupCoupon } from "@app/lib/metronome/coupons";
import { CouponResource } from "@app/lib/resources/coupon_resource";
import type { CouponType } from "@app/types/coupon";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

// `coupon` JSON-serializes to the wire (Date -> ISO string); the response type
// mirrors `CouponType` but is what the handler actually returns via ctx.json.
export type PostCouponRedeemResponseBody = {
  coupon: CouponType;
  redemptionId: string;
};

const PostCouponRedeemBodySchema = z.object({
  code: z.string().min(1),
});

// Mounted at /api/w/:wId/coupon/redeem. Redeems a "credits" coupon, granting
// bonus AWU credits to the workspace pool. Standalone (no payment).
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  ensureIsAdmin(),
  validate("json", PostCouponRedeemBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");

    const { code } = ctx.req.valid("json");

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

    const result = await redeemPoolTopupCoupon(auth, { coupon });
    if (result.isErr()) {
      const err = result.error;
      if (err instanceof Error) {
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to redeem coupon. Please try again.",
          },
        });
      }
      switch (err.code) {
        case "workspace_not_on_metronome":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "Credit coupons are not available for this workspace. Please contact support.",
            },
          });
        case "coupon_validation_failed": {
          const { reason } = err;
          let message: string;
          switch (reason.code) {
            case "wrong_coupon_type":
              message = "This coupon cannot be used for credit top-ups.";
              break;
            case "expired":
              message = "This coupon has expired.";
              break;
            case "exhausted":
              message = "This coupon has reached its redemption limit.";
              break;
            case "archived":
              message = "This coupon is no longer available.";
              break;
            case "already_redeemed":
              message =
                "This coupon has already been redeemed by this workspace.";
              break;
            default:
              assertNever(reason);
          }
          return apiError(ctx, {
            status_code: 400,
            api_error: { type: "coupon_not_redeemable", message },
          });
        }
        default:
          assertNever(err);
      }
    }

    return ctx.json({
      coupon: coupon.toJSON(),
      redemptionId: result.value.sId,
    });
  }
);

export default app;
