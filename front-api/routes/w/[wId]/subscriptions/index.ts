import {
  createCheckoutUrl,
  PostSubscriptionRequestBody,
} from "@app/lib/api/subscription/checkout_url";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import type {
  GetSubscriptionsResponseBody,
  PostSubscriptionResponseBody,
} from "@app/types/api/subscription";
import { PatchSubscriptionRequestBody } from "@app/types/api/subscription";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { workspaceApp } from "@front-api/middlewares/ctx";
import {
  ensureHasWorkspacePermission,
  ensureIsManager,
} from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

import awuPurchase from "./awu-purchase";
import awuPurchaseStatus from "./awu-purchase-status";
import checkout from "./checkout";
import checkoutStatus from "./checkout-status";
import pricing from "./pricing";
import status from "./status";

export type PatchSubscriptionResponseBody = {
  success: boolean;
};

// Mounted under /api/w/:wId/subscriptions. The bare `/` handles GET, POST,
// and PATCH on the workspace's subscription itself. POST/PATCH are admin-only;
// GET is also available to users with the `workspace:see_analytics` permission
// (the analytics page reads it to derive the activity-report date range).
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsManager(),
  async (ctx): HandlerResult<GetSubscriptionsResponseBody> => {
    const auth = ctx.get("auth");

    try {
      const fetched = await SubscriptionResource.fetchByAuthenticator(auth);
      return ctx.json({ subscriptions: fetched.map((s) => s.toJSON()) });
    } catch (error) {
      return apiError(
        ctx,
        {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Error while subscribing workspace to plan",
          },
        },
        normalizeError(error)
      );
    }
  }
);

app.post(
  "/",
  validate("json", PostSubscriptionRequestBody),
  ensureHasWorkspacePermission(
    "admin",
    "billing",
    "You need billing access to manage billing settings, invoices, and payment methods."
  ),
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
      return apiError(
        ctx,
        {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Error while subscribing workspace to plan",
          },
        },
        normalizeError(error)
      );
    }
  }
);

app.patch(
  "/",
  validate("json", PatchSubscriptionRequestBody),
  ensureHasWorkspacePermission(
    "admin",
    "billing",
    "You need billing access to manage billing settings, invoices, and payment methods."
  ),
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
      case "upgrade_to_business": {
        const owner = auth.getNonNullableWorkspace();
        const subscriptionResource = auth.getNonNullableSubscriptionResource();

        const result = await subscriptionResource.upgradeToBusinessPlan(owner);
        if (result.isErr()) {
          return apiError(
            ctx,
            {
              status_code: 400,
              api_error: {
                type: "subscription_state_invalid",
                message: result.error.message,
              },
            },
            result.error
          );
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

export default app;
