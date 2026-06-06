import type {
  GetSubscriptionsResponseBody,
  PostSubscriptionResponseBody,
} from "@app/lib/api/subscription";
import {
  isMetronomeBillingEnabled,
  PatchSubscriptionRequestBody,
} from "@app/lib/api/subscription";
import {
  createCheckoutUrl,
  PostSubscriptionRequestBody,
} from "@app/lib/api/subscription/checkout_url";
import { scheduleMetronomeContractEnd } from "@app/lib/metronome/client";
import {
  cancelSubscriptionAtPeriodEnd,
  skipSubscriptionFreeTrial,
} from "@app/lib/plans/stripe";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import logger from "@app/logger/logger";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

import awuPurchase from "./awu-purchase";
import awuPurchaseStatus from "./awu-purchase-status";
import checkout from "./checkout";
import checkoutStatus from "./checkout-status";
import pricing from "./pricing";
import status from "./status";
import trialInfo from "./trial-info";

export type PatchSubscriptionResponseBody = {
  success: boolean;
};

// Mounted under /api/w/:wId/subscriptions. The bare `/` handles GET, POST,
// and PATCH on the workspace's subscription itself; admin-only.
const app = workspaceApp();

app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetSubscriptionsResponseBody> => {
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
  }
);

app.post(
  "/",
  ensureIsAdmin(),
  validate("json", PostSubscriptionRequestBody),
  async (ctx): HandlerResult<PostSubscriptionResponseBody> => {
    const auth = ctx.get("auth");
    const body = ctx.req.valid("json");

    try {
      const { billingPeriod, couponCode, seatType, targetUserId } = body;

      const result = await createCheckoutUrl(auth, {
        billingPeriod,
        couponCode,
        seatType,
        targetUserId,
      });
      if (result.isErr()) {
        const message =
          result.error.type === "already_on_pro_plan"
            ? "Workspace is already subscribed to a Pro or Business plan."
            : "seatType and targetUserId are required for CP checkout.";
        return apiError(ctx, {
          status_code: 400,
          api_error: { type: "invalid_request_error", message },
        });
      }

      return ctx.json(result.value);
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
  }
);

app.patch(
  "/",
  ensureIsAdmin(),
  validate("json", PatchSubscriptionRequestBody),
  async (ctx): HandlerResult<PatchSubscriptionResponseBody> => {
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
  }
);

app.route("/awu-purchase", awuPurchase);
app.route("/awu-purchase-status", awuPurchaseStatus);
app.route("/checkout", checkout);
app.route("/checkout-status", checkoutStatus);
app.route("/pricing", pricing);
app.route("/status", status);
app.route("/trial-info", trialInfo);

export default app;
