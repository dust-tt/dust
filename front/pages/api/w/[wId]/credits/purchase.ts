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
} from "@app/lib/credits/committed";
import {
  getStripeSubscription,
  isEnterpriseSubscription,
} from "@app/lib/plans/stripe";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export const PostCreditPurchaseRequestBody = t.type({
  amountDollars: t.number,
});

type PostCreditPurchaseResponseBody = {
  success: boolean;
  creditsAddedMicroUsd: number;
  invoiceId: string | null;
  paymentUrl: string | null;
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

  // Check feature flag.
  const workspace = auth.getNonNullableWorkspace();
  const featureFlags = await getFeatureFlags(workspace);

  if (!featureFlags.includes("ppul")) {
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

      // Get Stripe subscription and determine if Enterprise.
      const stripeSubscription = await getStripeSubscription(
        subscription.stripeSubscriptionId
      );
      if (!stripeSubscription) {
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
      // Convert dollars to micro USD for internal storage.
      const amountMicroUsd = Math.round(amountDollars * 1_000_000);
      const isEnterprise = isEnterpriseSubscription(stripeSubscription);

      // Fetch discount from programmatic usage configuration.
      const programmaticConfig =
        await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);
      const discountPercent =
        programmaticConfig?.defaultDiscountPercent &&
        programmaticConfig.defaultDiscountPercent > 0
          ? programmaticConfig.defaultDiscountPercent
          : undefined;

      if (isEnterprise) {
        const result = await createEnterpriseCreditPurchase({
          auth,
          stripeSubscriptionId: subscription.stripeSubscriptionId,
          amountMicroUsd,
          discountPercent,
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
          creditsAddedMicroUsd: amountMicroUsd,
          invoiceId: null,
          paymentUrl: null,
        });
      }
      const result = await createProCreditPurchase({
        auth,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        amountMicroUsd,
        discountPercent,
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
        creditsAddedMicroUsd: amountMicroUsd,
        invoiceId: result.value.invoiceId,
        paymentUrl: result.value.paymentUrl,
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
