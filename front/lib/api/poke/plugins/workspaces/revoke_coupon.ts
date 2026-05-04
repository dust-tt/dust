import { createPlugin } from "@app/lib/api/poke/types";
import { revokeCouponRedemption } from "@app/lib/metronome/coupons";
import { CouponRedemptionResource } from "@app/lib/resources/coupon_redemption_resource";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";

const RevokeCouponArgsSchema = z
  .object({
    redemptionId: z.array(z.string()).min(1, "Please select a redemption"),
    confirm: z.boolean(),
  })
  .refine((data) => data.confirm === true, {
    message: "Please confirm before revoking the coupon redemption",
  });

export const revokeCouponPlugin = createPlugin({
  manifest: {
    id: "revoke-coupon",
    name: "Revoke Coupon Redemption",
    description:
      "Revoke an active coupon redemption for this workspace. This ends the Metronome credit and marks the redemption as revoked.",
    resourceTypes: ["workspaces"],
    args: {
      redemptionId: {
        type: "enum",
        label: "Active Redemption",
        description: "Select the active coupon redemption to revoke",
        async: true,
        values: [],
        multiple: false,
      },
      confirm: {
        type: "boolean",
        label: "Confirm Revocation",
        description:
          "I confirm I want to revoke this coupon redemption. This will immediately stop the associated Metronome credit.",
      },
    },
  },
  populateAsyncArgs: async (auth) => {
    const items = await CouponRedemptionResource.listActiveByWorkspace(auth);
    return new Ok({
      redemptionId: items.map(({ redemption, couponCode }) => ({
        label: `Coupon ${couponCode} — redeemed ${redemption.redeemedAt.toISOString().slice(0, 10)} (${redemption.sId})`,
        value: redemption.sId,
      })),
    });
  },
  execute: async (auth, _, args) => {
    const validationResult = RevokeCouponArgsSchema.safeParse(args);
    if (!validationResult.success) {
      return new Err(new Error(fromZodError(validationResult.error).message));
    }

    const redemptionId = validationResult.data.redemptionId[0];
    const redemption = await CouponRedemptionResource.fetchById(
      auth,
      redemptionId
    );
    if (!redemption) {
      return new Err(
        new Error(`Redemption "${redemptionId}" not found for this workspace.`)
      );
    }

    const result = await revokeCouponRedemption(auth, { redemption });
    if (result.isErr()) {
      return result;
    }

    return new Ok({
      display: "text",
      value: `Redemption ${redemptionId} revoked successfully.`,
    });
  },
});
