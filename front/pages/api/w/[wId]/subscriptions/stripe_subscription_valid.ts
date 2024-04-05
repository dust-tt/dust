import type { WithAPIErrorReponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";
import type Stripe from "stripe";

import { Authenticator, getSession } from "@app/lib/auth";
import { getStripeSubscription } from "@app/lib/plans/stripe";
import { apiError, withLogging } from "@app/logger/withlogging";

// TODO(2024-04-05,pr): immediately after flav's merge, use the global constant
const REPORT_USAGE_VALUES = ["MAU_1", "MAU_5", "MAU_10", "PER_SEAT"];

export type GetSubscriptionResponseBody =
  | { valid: true }
  | { valid: false; reason: string };

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorReponse<GetSubscriptionResponseBody>>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  // Callers will be either superUsers (from poke) or admins of the workspace (from webhook calls)
  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can access this endpoint.",
      },
    });
  }

  const stripeSubscriptionId = req.query.stripeSubscriptionId as string;
  if (!stripeSubscriptionId || typeof stripeSubscriptionId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid request, missing stripeSubscriptionId.",
      },
    });
  }

  // for admins of the workspace (webhook call), we must already have the
  // subscription in our DB (matching the workspace)
  const subscription = auth.subscription();
  if (
    !auth.isDustSuperUser() &&
    (!subscription ||
      subscription.stripeSubscriptionId !== stripeSubscriptionId)
  ) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "subscription_not_found",
        message: "The subscription was not found.",
      },
    });
  }

  let stripeSubscription: Stripe.Subscription;
  try {
    stripeSubscription = await getStripeSubscription(stripeSubscriptionId);
  } catch (error) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Error while fetching subscription from stripe.\n${error}`,
      },
    });
  }

  switch (req.method) {
    case "GET": {
      // Various validity checks for the subscription

      // for superUsers (poke call), we check that the subscription is either
      // not yet attributed to a workspace, or is attributed to the auth's
      // workspace
      if (
        auth.isDustSuperUser() &&
        subscription &&
        subscription.stripeSubscriptionId !== stripeSubscriptionId
      ) {
        return res.status(200).json({
          valid: false,
          reason: "Subscription is bound to a different workspace.",
        });
      }

      if (stripeSubscription.items.data.length === 0) {
        return res.status(200).json({
          valid: false,
          reason: "Subscription has no items.",
        });
      }

      // very unlikely, so handling is overkill at time of writing
      if (stripeSubscription.items.has_more) {
        return res.status(200).json({
          valid: false,
          reason: "Subscription has too many items.",
        });
      }

      // All the business logic checks below are validating that the stripe
      // subscription doesn't have a configuration that we don't support

      for (const item of stripeSubscription.items.data) {
        if (item.deleted) continue;
        if (item.price.recurring) {
          if (item.price.recurring.usage_type !== "metered") {
            return res.status(200).json({
              valid: false,
              reason: `Subscription recurring price has invalid usage_type '${item.price.recurring.usage_type}'. Only 'metered' usage_type is allowed.`,
            });
          }

          if (REPORT_USAGE_VALUES.includes(item.price.metadata?.REPORT_USAGE)) {
            return res.status(200).json({
              valid: false,
              reason:
                "Subscription recurring price should have a REPORT_USAGE metadata with values in " +
                JSON.stringify(REPORT_USAGE_VALUES),
            });
          }

          if (item.price.recurring.aggregate_usage !== "last_during_period") {
            return res.status(200).json({
              valid: false,
              reason:
                "Subscription recurring price has invalid aggregate_usage, should be last duing period",
            });
          }

          if (
            item.price.recurring.interval !== "month" ||
            item.price.recurring.interval_count !== 1
          ) {
            return res.status(200).json({
              valid: false,
              reason:
                "Subscription recurring price has invalid interval, only 1-month intervals are allowed.",
            });
          }
        }
      }

      // the subscription is not active
      if (stripeSubscription.status !== "active") {
        return res.status(200).json({
          valid: false,
          reason: "Subscription is not active.",
        });
      }

      return res.status(200).json({ valid: true });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withLogging(handler);
