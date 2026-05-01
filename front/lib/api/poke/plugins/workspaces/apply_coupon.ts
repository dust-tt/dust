import { createPlugin } from "@app/lib/api/poke/types";
import { redeemCoupon } from "@app/lib/metronome/coupons";
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
      "Apply a coupon to this workspace on behalf of the customer. The workspace must already be provisioned on Metronome.",
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

    const result = await redeemCoupon(auth, { coupon });
    if (result.isErr()) {
      const err = result.error;
      if (err instanceof Error) {
        return new Err(err);
      }
      switch (err.code) {
        case "workspace_not_on_metronome":
          return new Err(
            new Error(
              "Workspace is not provisioned on Metronome. Provision it first using the 'Switch to Metronome Billing' plugin."
            )
          );
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
            default:
              return assertNever(err.reason);
          }
        default:
          return assertNever(err);
      }
    }

    const redemption = result.value;
    return new Ok({
      display: "text",
      value: `Coupon "${couponCode}" applied successfully. Redemption ID: ${redemption.sId}.`,
    });
  },
});
