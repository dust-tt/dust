import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { FeatureFlag } from "@app/lib/models/feature_flag";
import {
  attachCreditPurchaseToSubscription,
  createAndPayCreditPurchaseInvoice,
  getStripeClient,
  isEnterpriseSubscription,
} from "@app/lib/plans/stripe";
import { CreditResource } from "@app/lib/resources/credit_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isDevelopment } from "@app/types";

export const PostCreditPurchaseRequestBody = t.type({
  amountDollars: t.number,
});

type PostCreditPurchaseResponseBody = {
  success: boolean;
  creditsAdded: number;
  invoiceId: string | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostCreditPurchaseResponseBody>>,
  auth: Authenticator
): Promise<void> {
  // Only admins can purchase credits
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can purchase credits.",
      },
    });
  }

  // Check feature flag
  const workspace = auth.getNonNullableWorkspace();
  const featureFlag =
    (await FeatureFlag.findOne({
      where: {
        workspaceId: workspace.id,
        name: "ppul_credits_purchase_flow",
      },
    })) ?? isDevelopment();

  if (!featureFlag) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "This feature is not enabled for your workspace.",
      },
    });
  }

  switch (req.method) {
    case "POST": {
      const bodyValidation = PostCreditPurchaseRequestBody.decode(req.body);
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

      const { amountDollars } = bodyValidation.right;

      // Validate amount is positive
      if (amountDollars <= 0) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Amount must be greater than 0.",
          },
        });
      }

      // Get active subscription
      const subscription = auth.subscription();
      if (!subscription || !subscription.stripeSubscriptionId) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "subscription_not_found",
            message:
              "No active Stripe subscription found. Please subscribe to a plan first.",
          },
        });
      }

      try {
        // Get Stripe subscription to determine if Enterprise
        const stripe = getStripeClient();
        const stripeSubscription = await stripe.subscriptions.retrieve(
          subscription.stripeSubscriptionId
        );
        const isEnterprise = isEnterpriseSubscription(stripeSubscription);

        // Convert dollars to cents for internal storage
        const amountCents = Math.round(amountDollars * 100);

        // Orchestrate credit purchase based on subscription type
        if (isEnterprise) {
          // For Enterprise: attach invoice item to subscription
          const attachResult = await attachCreditPurchaseToSubscription({
            stripeSubscriptionId: subscription.stripeSubscriptionId,
            amountCents,
          });

          if (attachResult.isErr()) {
            logger.error(
              {
                error: attachResult.error.error_message,
                workspaceId: workspace.sId,
                amountDollars,
              },
              "Failed to attach credit purchase to subscription"
            );
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: "Failed to process credit purchase.",
              },
            });
          }

          const invoiceItemId = attachResult.value;

          // Create placeholder credit with 0/0 amounts
          await CreditResource.makeNew(auth, {
            initialAmount: 0,
            remainingAmount: 0,
            invoiceOrLineItemId: invoiceItemId,
          });

          // Immediately top-up with full amount and set expiration
          const topUpResult = await CreditResource.topUp({
            auth,
            invoiceOrLineItemId: invoiceItemId,
            amountCents,
          });

          if (topUpResult.isErr()) {
            logger.error(
              {
                error: topUpResult.error.message,
                workspaceId: workspace.sId,
                invoiceItemId,
              },
              "Failed to top-up credit after creating placeholder"
            );
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: "Failed to process credit purchase.",
              },
            });
          }

          logger.info(
            {
              workspaceId: workspace.sId,
              amountCents,
              amountDollars,
              invoiceItemId,
              expirationDate: topUpResult.value.expirationDate,
            },
            "Credit purchase attached to subscription, credits topped up with expiration"
          );

          return res.status(200).json({
            success: true,
            creditsAdded: amountCents,
            invoiceId: null,
          });
        } else {
          // For Pro: create and pay one-off invoice
          const invoiceResult = await createAndPayCreditPurchaseInvoice({
            stripeSubscriptionId: subscription.stripeSubscriptionId,
            amountCents,
          });

          if (invoiceResult.isErr()) {
            logger.error(
              {
                error: invoiceResult.error.error_message,
                workspaceId: workspace.sId,
                amountDollars,
              },
              "Failed to create and pay credit purchase invoice"
            );
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: "Failed to process credit purchase.",
              },
            });
          }

          const invoice = invoiceResult.value;

          // Create credit record with 0/0 amounts (will be updated via webhook when paid)
          await CreditResource.makeNew(auth, {
            initialAmount: 0,
            remainingAmount: 0,
            invoiceOrLineItemId: invoice.id,
          });

          logger.info(
            {
              workspaceId: workspace.sId,
              amountCents,
              amountDollars,
              invoiceId: invoice.id,
            },
            "Credit purchase invoice created and paid, placeholder credit created, amounts will be updated via webhook"
          );

          return res.status(200).json({
            success: true,
            creditsAdded: amountCents,
            invoiceId: invoice.id,
          });
        }
      } catch (error) {
        logger.error(
          {
            error,
            workspaceId: workspace.sId,
            amountDollars,
          },
          "Error while processing credit purchase"
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Error while processing credit purchase.",
          },
        });
      }
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
