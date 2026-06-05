/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { isMetronomeBillingEnabled } from "@app/lib/api/subscription";
import {
  createCheckoutUrl,
  PostSubscriptionRequestBody,
} from "@app/lib/api/subscription/checkout_url";
import type { Authenticator } from "@app/lib/auth";
import { scheduleMetronomeContractEnd } from "@app/lib/metronome/client";
import {
  cancelSubscriptionAtPeriodEnd,
  skipSubscriptionFreeTrial,
} from "@app/lib/plans/stripe";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { CheckoutUrlResult, SubscriptionType } from "@app/types/plan";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export type PostSubscriptionResponseBody = CheckoutUrlResult;

type PatchSubscriptionResponseBody = {
  success: boolean;
};

export type GetSubscriptionsResponseBody = {
  subscriptions: SubscriptionType[];
};

export const PatchSubscriptionRequestBody = z.object({
  action: z.enum(["cancel_free_trial", "pay_now", "upgrade_to_business"]),
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
      const bodyValidation = PostSubscriptionRequestBody.safeParse(req.body);
      if (!bodyValidation.success) {
        const pathError = fromError(bodyValidation.error).toString();
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      try {
        const { billingPeriod, couponCode, seatType, targetUserId } =
          bodyValidation.data;

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
          return apiError(req, res, {
            status_code: 400,
            api_error: { type: "invalid_request_error", message },
          });
        }

        return res.status(200).json(result.value);
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
      const bodyValidation = PatchSubscriptionRequestBody.safeParse(req.body);
      if (!bodyValidation.success) {
        const pathError = fromError(bodyValidation.error).toString();
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

      const { action } = bodyValidation.data;

      switch (action) {
        case "cancel_free_trial": {
          if (!subscription.trialing) {
            return apiError(req, res, {
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
            return apiError(req, res, {
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
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: "Failed to end Metronome contract.",
              },
            });
          }
          break;
        }
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

        case "upgrade_to_business":
          {
            const owner = auth.getNonNullableWorkspace();
            const subscriptionResource =
              auth.getNonNullableSubscriptionResource();

            const result =
              await subscriptionResource.upgradeToBusinessPlan(owner);

            if (result.isErr()) {
              logger.error(
                { error: result.error },
                "Error while upgrading to business plan"
              );
              return apiError(req, res, {
                status_code: 400,
                api_error: {
                  type: "subscription_state_invalid",
                  message: result.error.message,
                },
              });
            }
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

export default withSessionAuthenticationForWorkspace(handler, {
  doesNotRequireCanUseProduct: true,
});
