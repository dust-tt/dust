import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import {
  cancelSubscriptionImmediately,
  skipSubscriptionFreeTrial,
} from "@app/lib/plans/stripe";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type {
  PlanType,
  SubscriptionType,
  WithAPIErrorResponse,
} from "@app/types";
import { assertNever } from "@app/types";

export type PostSubscriptionResponseBody = {
  plan: PlanType;
  checkoutUrl?: string;
};

type PatchSubscriptionResponseBody = {
  success: boolean;
};

export type GetSubscriptionsResponseBody = {
  subscriptions: SubscriptionType[];
};

export const PostSubscriptionRequestBody = t.type({
  billingPeriod: t.union([t.literal("monthly"), t.literal("yearly")]),
});

export const PatchSubscriptionRequestBody = t.type({
  action: t.union([t.literal("cancel_free_trial"), t.literal("pay_now")]),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | GetSubscriptionsResponseBody
      | PostSubscriptionResponseBody
      | PatchSubscriptionResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
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

  switch (req.method) {
    case "GET": {
      try {
        const fetchedSubscriptions =
          await SubscriptionResource.fetchByAuthenticator(auth);
        const subscriptions = fetchedSubscriptions.map((s) => s.toJSON());
        return res.status(200).json({ subscriptions });
      } catch (error) {
        logger.error({ error }, "Error while subscribing workspace to plan");
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Error while subscribing workspace to plan",
          },
        });
      }
    }
    case "POST": {
      const bodyValidation = PostSubscriptionRequestBody.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      try {
        const { checkoutUrl, plan: newPlan } = await auth
          .getNonNullableSubscriptionResource()
          .getCheckoutUrlForUpgrade(
            auth.getNonNullableWorkspace(),
            auth.getNonNullableUser().toJSON(),
            bodyValidation.right.billingPeriod
          );
        return res.status(200).json({ checkoutUrl, plan: newPlan });
      } catch (error) {
        logger.error({ error }, "Error while subscribing workspace to plan");
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Error while subscribing workspace to plan",
          },
        });
      }
    }

    case "PATCH": {
      const bodyValidation = PatchSubscriptionRequestBody.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }
      const subscription = auth.subscription();
      if (!subscription) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "subscription_not_found",
            message: "The subscription was not found.",
          },
        });
      }

      const { action } = bodyValidation.right;

      switch (action) {
        case "cancel_free_trial":
          if (!subscription.trialing) {
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "action_unknown_error",
                message: "The subscription is not in a trialing state.",
              },
            });
          }
          if (!subscription.stripeSubscriptionId) {
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "subscription_state_invalid",
                message: "The subscription free trial can't be cancelled.",
              },
            });
          }

          await cancelSubscriptionImmediately({
            stripeSubscriptionId: subscription.stripeSubscriptionId,
          });
          break;
        case "pay_now":
          {
            if (!subscription.trialing) {
              return apiError(req, res, {
                status_code: 400,
                api_error: {
                  type: "subscription_state_invalid",
                  message: "The subscription is not in a trialing state.",
                },
              });
            }
            if (!subscription.stripeSubscriptionId) {
              return apiError(req, res, {
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
          }
          break;

        default:
          assertNever(action);
      }

      res.status(200).json({ success: true });
      break;
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
