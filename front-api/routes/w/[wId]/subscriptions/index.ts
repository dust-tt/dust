import { isMetronomeBillingEnabled } from "@app/lib/api/subscription";
import { scheduleMetronomeContractEnd } from "@app/lib/metronome/client";
import {
  cancelSubscriptionAtPeriodEnd,
  skipSubscriptionFreeTrial,
} from "@app/lib/plans/stripe";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import logger from "@app/logger/logger";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";

import checkoutStatus from "./checkout-status";
import pricing from "./pricing";
import status from "./status";
import trialInfo from "./trial-info";

const PostSubscriptionRequestBody = z.object({
  billingPeriod: z.enum(["monthly", "yearly"]),
  couponCode: z.string().optional(),
});

const PatchSubscriptionRequestBody = z.object({
  action: z.enum(["cancel_free_trial", "pay_now", "upgrade_to_business"]),
});

// Mounted under /api/w/:wId/subscriptions. The bare `/` handles GET, POST,
// and PATCH on the workspace's subscription itself; admin-only.
const app = new Hono();

function requireAdmin(ctx: Context) {
  const auth = ctx.get("auth");
  if (!auth.isAdmin()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can access this endpoint.",
      },
    });
  }
  return null;
}

app.get("/", async (ctx) => {
  const denied = requireAdmin(ctx);
  if (denied) {
    return denied;
  }
  const auth = ctx.get("auth");

  try {
    const fetched = await SubscriptionResource.fetchByAuthenticator(auth);
    return ctx.json({ subscriptions: fetched.map((s) => s.toJSON()) });
  } catch (error) {
    logger.error({ error }, "Error while subscribing workspace to plan");
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Error while subscribing workspace to plan",
      },
    });
  }
});

app.post("/", validate("json", PostSubscriptionRequestBody), async (ctx) => {
  const denied = requireAdmin(ctx);
  if (denied) {
    return denied;
  }
  const auth = ctx.get("auth");
  const body = ctx.req.valid("json");

  try {
    const useMetronomeBilling = await isMetronomeBillingEnabled(auth);
    const owner = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser().toJSON();
    const subscription = auth.getNonNullableSubscriptionResource();

    const checkoutUrlResult = await subscription.getCheckoutUrlForUpgrade(
      owner,
      user,
      body.billingPeriod,
      {
        useMetronomeBilling,
        couponCode: body.couponCode,
      }
    );

    return ctx.json(checkoutUrlResult);
  } catch (error) {
    logger.error({ error }, "Error while subscribing workspace to plan");
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Error while subscribing workspace to plan",
      },
    });
  }
});

app.patch("/", validate("json", PatchSubscriptionRequestBody), async (ctx) => {
  const denied = requireAdmin(ctx);
  if (denied) {
    return denied;
  }
  const auth = ctx.get("auth");

  const subscription = auth.subscription();
  if (!subscription) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "subscription_not_found",
        message: "The subscription was not found.",
      },
    });
  }

  const { action } = ctx.req.valid("json");

  switch (action) {
    case "cancel_free_trial": {
      if (!subscription.trialing) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "action_unknown_error",
            message: "The subscription is not in a trialing state.",
          },
        });
      }

      const owner = auth.getNonNullableWorkspace();
      const useMetronomeBilling = await isMetronomeBillingEnabled(auth);

      if (!subscription.stripeSubscriptionId && !useMetronomeBilling) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "subscription_state_invalid",
            message: "The subscription free trial can't be cancelled.",
          },
        });
      }

      if (subscription.stripeSubscriptionId) {
        await cancelSubscriptionAtPeriodEnd({
          stripeSubscriptionId: subscription.stripeSubscriptionId,
        });
      }

      if (!subscription.metronomeContractId || !owner.metronomeCustomerId) {
        break;
      }

      const result = await scheduleMetronomeContractEnd({
        metronomeCustomerId: owner.metronomeCustomerId,
        contractId: subscription.metronomeContractId,
      });
      if (result.isErr() && useMetronomeBilling) {
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to end Metronome contract.",
          },
        });
      }
      break;
    }
    case "pay_now": {
      if (!subscription.trialing) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "subscription_state_invalid",
            message: "The subscription is not in a trialing state.",
          },
        });
      }
      if (!subscription.stripeSubscriptionId) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "subscription_state_invalid",
            message: "The subscription free trial can't be skipped.",
          },
        });
      }

      await skipSubscriptionFreeTrial({
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      });
      break;
    }
    case "upgrade_to_business": {
      const owner = auth.getNonNullableWorkspace();
      const subscriptionResource = auth.getNonNullableSubscriptionResource();

      const result = await subscriptionResource.upgradeToBusinessPlan(owner);
      if (result.isErr()) {
        logger.error(
          { error: result.error },
          "Error while upgrading to business plan"
        );
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "subscription_state_invalid",
            message: result.error.message,
          },
        });
      }
      break;
    }
    default:
      assertNever(action);
  }

  return ctx.json({ success: true });
});

app.route("/checkout-status", checkoutStatus);
app.route("/pricing", pricing);
app.route("/status", status);
app.route("/trial-info", trialInfo);

export default app;
