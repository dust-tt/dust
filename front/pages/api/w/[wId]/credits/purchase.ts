import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import {
  createEnterpriseCreditPurchase,
  createProCreditPurchase,
} from "@app/lib/credits/purchase";
import {
  getStripeSubscription,
  isEnterpriseSubscription,
} from "@app/lib/plans/stripe";
<<<<<<< HEAD
||||||| parent of 47c503a005 ([front] feat: PPUL - Add credit list table and cleanup components)
import { CreditResource } from "@app/lib/resources/credit_resource";
=======
import { isTrial } from "@app/lib/plans/trial";
import { CreditResource } from "@app/lib/resources/credit_resource";
>>>>>>> 47c503a005 ([front] feat: PPUL - Add credit list table and cleanup components)
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
  // Only admins can purchase credits.
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

  // Check feature flag.
  const workspace = auth.getNonNullableWorkspace();
  const featureFlags = await getFeatureFlags(workspace);

  if (
    !featureFlags.includes("ppul_credits_purchase_flow") &&
    !isDevelopment()
  ) {
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

      // Validate amount is positive.
      if (amountDollars <= 0) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Amount must be greater than 0.",
          },
        });
      }

      // Get active subscription.
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

<<<<<<< HEAD
      // Get Stripe subscription and determine if Enterprise.
      const stripeSubscription = await getStripeSubscription(
        subscription.stripeSubscriptionId
      );
      if (!stripeSubscription) {
||||||| parent of 47c503a005 ([front] feat: PPUL - Add credit list table and cleanup components)
      try {
        // Get Stripe subscription to determine if Enterprise.
        const stripe = getStripeClient();
        const stripeSubscription = await stripe.subscriptions.retrieve(
          subscription.stripeSubscriptionId
        );
        const isEnterprise = isEnterpriseSubscription(stripeSubscription);

        // Convert dollars to cents for internal storage.
        const amountCents = Math.round(amountDollars * 100);

        // Orchestrate credit purchase based on subscription type.
        if (isEnterprise) {
          // For Enterprise: attach invoice item to subscription.
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

          // Create credit with full amount.
          const credit = await CreditResource.makeNew(auth, {
            type: "committed",
            initialAmount: amountCents,
            remainingAmount: amountCents,
            invoiceOrLineItemId: invoiceItemId,
          });

          // Activate the credit immediately.
          const startResult = await credit.start();

          if (startResult.isErr()) {
            logger.error(
              {
                error: startResult.error.message,
                workspaceId: workspace.sId,
                invoiceItemId,
              },
              "Failed to start credit after creation"
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
              expirationDate: credit.expirationDate,
            },
            "Credit purchase attached to subscription and activated"
          );

          return res.status(200).json({
            success: true,
            creditsAdded: amountCents,
            invoiceId: null,
          });
        } else {
          // For Pro: create and pay one-off invoice.
          const invoiceResult = await makeAndPayCreditPurchaseInvoice({
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
              "Failed to make credit purchase invoice"
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

          // Create credit record with full amount (will be activated via webhook when paid).
          await CreditResource.makeNew(auth, {
            type: "committed",
            initialAmount: amountCents,
            remainingAmount: amountCents,
            invoiceOrLineItemId: invoice.id,
          });

          logger.info(
            {
              workspaceId: workspace.sId,
              amountCents,
              amountDollars,
              invoiceId: invoice.id,
            },
            "Credit purchase invoice created, credit will be started via webhook"
          );

          return res.status(200).json({
            success: true,
            creditsAdded: amountCents,
            invoiceId: invoice.id,
          });
        }
      } catch (error) {
=======
      // Check if subscription is in trial period.
      if (isTrial(subscription)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "trial_restriction",
            message:
              "Credit purchases are not available during the trial period. Please upgrade to a paid plan to purchase credits.",
          },
        });
      }

      try {
        // Get Stripe subscription to determine if Enterprise.
        const stripe = getStripeClient();
        const stripeSubscription = await stripe.subscriptions.retrieve(
          subscription.stripeSubscriptionId
        );
        const isEnterprise = isEnterpriseSubscription(stripeSubscription);

        // Convert dollars to cents for internal storage.
        const amountCents = Math.round(amountDollars * 100);

        // Orchestrate credit purchase based on subscription type.
        if (isEnterprise) {
          // For Enterprise: attach invoice item to subscription.
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

          // Create credit with full amount.
          const credit = await CreditResource.makeNew(auth, {
            type: "committed",
            initialAmount: amountCents,
            remainingAmount: amountCents,
            invoiceOrLineItemId: invoiceItemId,
          });

          // Activate the credit immediately.
          const startResult = await credit.start();

          if (startResult.isErr()) {
            logger.error(
              {
                error: startResult.error.message,
                workspaceId: workspace.sId,
                invoiceItemId,
              },
              "Failed to start credit after creation"
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
              expirationDate: credit.expirationDate,
            },
            "Credit purchase attached to subscription and activated"
          );

          return res.status(200).json({
            success: true,
            creditsAdded: amountCents,
            invoiceId: null,
          });
        } else {
          // For Pro: create and pay one-off invoice.
          const invoiceResult = await makeAndPayCreditPurchaseInvoice({
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
              "Failed to make credit purchase invoice"
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

          // Create credit record with full amount (will be activated via webhook when paid).
          await CreditResource.makeNew(auth, {
            type: "committed",
            initialAmount: amountCents,
            remainingAmount: amountCents,
            invoiceOrLineItemId: invoice.id,
          });

          logger.info(
            {
              workspaceId: workspace.sId,
              amountCents,
              amountDollars,
              invoiceId: invoice.id,
            },
            "Credit purchase invoice created, credit will be started via webhook"
          );

          return res.status(200).json({
            success: true,
            creditsAdded: amountCents,
            invoiceId: invoice.id,
          });
        }
      } catch (error) {
>>>>>>> 47c503a005 ([front] feat: PPUL - Add credit list table and cleanup components)
        logger.error(
          {
            workspaceId: workspace.sId,
            stripeError: true,
            stripeSubscriptionId: subscription.stripeSubscriptionId,
          },
          "Failed to retrieve Stripe subscription"
        );
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "subscription_not_found",
            message: "[Credit Purchase] Stripe subscription not found.",
          },
        });
      }
      // Convert dollars to cents for internal storage.
      const amountCents = Math.round(amountDollars * 100);
      const isEnterprise = isEnterpriseSubscription(stripeSubscription);

      if (isEnterprise) {
        const result = await createEnterpriseCreditPurchase({
          auth,
          stripeSubscriptionId: subscription.stripeSubscriptionId,
          amountCents,
        });

        if (result.isErr()) {
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "Failed to process credit purchase.",
            },
          });
        }

        return res.status(200).json({
          success: true,
          creditsAdded: amountCents,
          invoiceId: null,
        });
      }
      const result = await createProCreditPurchase({
        auth,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        amountCents,
      });

      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to process credit purchase.",
          },
        });
      }

      return res.status(200).json({
        success: true,
        creditsAdded: amountCents,
        invoiceId: result.value.invoiceId,
      });
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
