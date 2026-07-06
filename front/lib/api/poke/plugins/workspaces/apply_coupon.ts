import { createPlugin } from "@app/lib/api/poke/types";
import { redeemSeatCoupon, redeemPoolTopupCoupon } from "@app/lib/metronome/coupons";
import type { CouponValidationError } from "@app/lib/resources/coupon_resource";
import { CouponResource } from "@app/lib/resources/coupon_resource";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";

const ApplyCouponArgsSchema = z
  .object({
    couponCode: z.string().min(1, "Coupon code is required"),
    confirm: z.boolean(),
  })
  .refine((data) => data.confirm === true, {
    message: "Please confirm before applying the coupon",
  });

export const applyCouponPlugin = createPlugin({
  manifest: {
    id: "apply-coupon",
    name: "Apply Coupon",
    description:
      "Apply a coupon to this workspace on behalf of the customer. " +
      "Supports both seat coupons (subscription discount) and usage coupons (AWU credit top-up). " +
      "The workspace must already be provisioned on Metronome.",
    resourceTypes: ["workspaces"],
    args: {
      couponCode: {
        type: "string",
        label: "Coupon Code",
        description: "The coupon code to apply to this workspace",
      },
      confirm: {
        type: "boolean",
        label: "Confirm",
        description: "I confirm I want to apply this coupon to the workspace.",
      },
    },
    requiredRoles: ["billing"],
  },
  execute: async (auth, _, args) => {
    const validationResult = ApplyCouponArgsSchema.safeParse(args);
    if (!validationResult.success) {
      return new Err(new Error(fromZodError(validationResult.error).message));
    }

    const { couponCode } = validationResult.data;

    const coupon = await CouponResource.findByCode(couponCode);
    if (!coupon) {
      return new Err(new Error(`Coupon not found: "${couponCode}".`));
    }

    const { discountType } = coupon;

    let result;
    switch (discountType) {
      case "seat":
        result = await redeemSeatCoupon(auth, { coupon });
        break;
      case "credit_pool_top_up":
        result = await redeemPoolTopupCoupon(auth, { coupon });
        break;
      default:
        return assertNever(discountType);
    }

    if (result.isErr()) {
      const err = result.error;
      if (err instanceof Error) {
        return new Err(err);
      }
      return handleRedeemError(couponCode, err);
    }

    const redemption = result.value;

    let typeLabel;
    switch (discountType) {
      case "seat":
        typeLabel = "seat discount (subscription)";
        break;
      case "credit_pool_top_up":
        typeLabel = "usage credit top-up (AWU)";
        break;
      default:
        return assertNever(discountType);
    }

    return new Ok({
      display: "text",
      value: `Coupon "${couponCode}" applied successfully.\nType: ${typeLabel}\nRedemption ID: ${redemption.sId}.`,
    });
  },
});

function handleRedeemError(
  couponCode: string,
  err:
    | { code: "workspace_not_on_metronome" }
    | { code: "coupon_validation_failed"; reason: CouponValidationError }
): Err<Error> {
  switch (err.code) {
    case "workspace_not_on_metronome":
      return new Err(new Error("Workspace is not provisioned on Metronome."));
    case "coupon_validation_failed":
      switch (err.reason.code) {
        case "expired":
          return new Err(
            new Error(
              `Coupon "${couponCode}" expired on ${err.reason.expirationDate.toISOString()}.`
            )
          );
        case "exhausted":
          return new Err(
            new Error(
              `Coupon "${couponCode}" has reached its limit of ${err.reason.maxRedemptions} redemption(s).`
            )
          );
        case "archived":
          return new Err(new Error(`Coupon "${couponCode}" is archived.`));
        case "already_redeemed":
          return new Err(
            new Error(
              `Coupon "${couponCode}" has already been redeemed by this workspace.`
            )
          );
        case "wrong_coupon_type":
          // Defensive fallback — should not be reached with proper discountType routing.
          return new Err(
            new Error(
              `Coupon "${couponCode}" is not valid for its detected coupon type.`
            )
          );
        default:
          return assertNever(err.reason);
      }
    default:
      return assertNever(err);
  }
}
