/**
 * Recovery script for the panic log:
 *   "[Checkout] Payment succeeded but Metronome provisioning failed"
 *
 * Context:
 *   The customer has been successfully charged via Stripe but
 *   provisionMetronomeFirstPeriodSubscription failed afterwards. Their workspace
 *   is not yet subscribed. This script re-runs the provisioning call, which is
 *   fully idempotent (all Metronome calls use uniqueness/idempotency keys), so
 *   it is safe to replay from scratch.
 *
 * Usage (from prodbox, inside the front/ directory):
 *   npx tsx scripts/checkout_retry_metronome_provisioning.ts \
 *     --log '<paste JSON string from Datadog log here>' \
 *     [--execute]
 *
 * Without --execute the script runs in dry-run mode: it resolves and validates
 * all parameters but does NOT call provisionMetronomeFirstPeriodSubscription.
 */

import { Authenticator } from "@app/lib/auth";
import { provisionMetronomeFirstPeriodSubscription } from "@app/lib/metronome/checkout";
import { CouponRedemptionResource } from "@app/lib/resources/coupon_redemption_resource";
import { CouponResource } from "@app/lib/resources/coupon_resource";
import { z } from "zod";

import { makeScript } from "./helpers";

// Shape of the structured attributes in the Datadog log entry.
const LogSchema = z.object({
  stripeCustomerId: z.string(),
  currency: z.string(),
  workspaceId: z.string(),
  userId: z.string(),
  planCode: z.string(),
  metronomePackageAlias: z.string(),
  couponId: z.string().optional(),
  pendingRedemptionId: z.string().optional(),
  firstPeriodPaymentEnforced: z.boolean(),
  firstPeriodPaymentCents: z.number(),
  uniquenessKey: z.string(),
});

makeScript(
  {
    log: {
      type: "string",
      describe:
        "JSON string copied from the Datadog log attributes (wrap in single quotes in the shell)",
      demandOption: true,
    },
  },
  async ({ log, execute }, logger) => {
    // 1. Parse the raw JSON string.
    let parsed: unknown;
    try {
      parsed = JSON.parse(log);
    } catch (e) {
      logger.error({ error: e }, "Failed to parse --log argument as JSON");
      process.exit(1);
    }

    // 2. Validate the shape.
    const validation = LogSchema.safeParse(parsed);
    if (!validation.success) {
      logger.error(
        { errors: validation.error.errors },
        "Log JSON does not match expected shape â€” check that you copied the full attribute block"
      );
      process.exit(1);
    }

    const {
      stripeCustomerId,
      currency,
      workspaceId,
      userId,
      planCode,
      metronomePackageAlias,
      couponId,
      pendingRedemptionId,
      firstPeriodPaymentEnforced,
      firstPeriodPaymentCents,
      uniquenessKey,
    } = validation.data;

    // 3. Resolve optional coupon.
    let coupon: CouponResource | undefined;
    if (couponId) {
      const found = await CouponResource.fetchByCouponId(couponId);
      if (!found) {
        logger.error({ couponId }, "Coupon not found in DB => aborting");
        process.exit(1);
      }
      coupon = found;
      logger.info({ couponId, couponCode: found.code }, "Resolved coupon");
    }

    // 4. Resolve optional pending redemption.
    //    fetchById is workspace-scoped so we need an admin Authenticator.
    let pendingRedemption: CouponRedemptionResource | undefined;
    if (pendingRedemptionId) {
      const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
      const found = await CouponRedemptionResource.fetchById(
        auth,
        pendingRedemptionId
      );
      if (!found) {
        logger.error(
          { pendingRedemptionId },
          "Coupon redemption not found in DB => aborting"
        );
        process.exit(1);
      }
      pendingRedemption = found;
      logger.info(
        { pendingRedemptionId, status: found.status },
        "Resolved coupon redemption"
      );
    }

    logger.info(
      {
        stripeCustomerId,
        currency,
        workspaceId,
        userId,
        planCode,
        metronomePackageAlias,
        couponId,
        pendingRedemptionId,
        firstPeriodPaymentEnforced,
        firstPeriodPaymentCents,
        uniquenessKey,
        execute,
      },
      "[Checkout] Resolved all parameters => ready to call provisionMetronomeFirstPeriodSubscription"
    );

    if (!execute) {
      logger.info(
        "Dry-run: skipping provisionMetronomeFirstPeriodSubscription. Pass --execute to run for real."
      );
      return;
    }

    // 5. Re-run the provisioning. Safe to pass now: new Date() as the function is
    //    fully idempotent via uniquenessKey (= the original setupSessionId).
    const result = await provisionMetronomeFirstPeriodSubscription({
      stripeCustomerId,
      currency,
      workspaceId,
      userId,
      planCode,
      metronomePackageAlias,
      coupon,
      pendingRedemption,
      firstPeriodPaymentEnforced,
      firstPeriodPaymentCents,
      uniquenessKey,
      now: new Date(),
    });

    if (result.isErr()) {
      logger.error(
        { error: result.error.message },
        "[Checkout] provisionMetronomeFirstPeriodSubscription failed => check the error and retry"
      );
      process.exit(1);
    }

    logger.info(
      { workspaceId, uniquenessKey },
      "[Checkout] provisionMetronomeFirstPeriodSubscription succeeded => workspace is now subscribed"
    );
  }
);
