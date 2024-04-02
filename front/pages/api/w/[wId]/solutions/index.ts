import type { PlanType, WithAPIErrorReponse } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import {
  cancelSubscriptionImmediately,
  skipSubscriptionFreeTrial,
} from "@app/lib/plans/stripe";
import { getCheckoutUrlForUpgrade } from "@app/lib/plans/subscription";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";

export type PostSubscriptionResponseBody = {
  plan: PlanType;
  checkoutUrl?: string;
};

type PatchSubscriptionResponseBody = {
  success: boolean;
};

export const PatchSubscriptionRequestBody = t.type({
  action: t.union([t.literal("cancel_free_trial"), t.literal("pay_now")]),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorReponse<
      PostSubscriptionResponseBody | PatchSubscriptionResponseBody
    >
  >
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  const plan = auth.plan();
  if (!owner || !plan) {
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
          "Only users that are `admins` for the current workspace can see memberships or modify it.",
      },
    });
  }

  switch (req.method) {
    case "POST": {
      try {
        const { checkoutUrl, plan: newPlan } = await getCheckoutUrlForUpgrade(
          auth
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
      break;
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
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withLogging(handler);
