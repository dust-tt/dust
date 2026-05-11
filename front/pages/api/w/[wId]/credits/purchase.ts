/** @ignoreswagger */
import { MAX_DISCOUNT_PERCENT } from "@app/lib/api/assistant/token_pricing";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { CreditPurchaseBillingTarget } from "@app/lib/credits/committed";
import {
  createEnterpriseCreditPurchase,
  createProCreditPurchase,
} from "@app/lib/credits/committed";
import type { CreditPurchaseLimits } from "@app/lib/credits/limits";
import { getCreditPurchaseLimits } from "@app/lib/credits/limits";
import { getMetronomeCustomerStripeCustomerId } from "@app/lib/metronome/client";
import { resolveCurrencyForExistingMetronomeCustomer } from "@app/lib/metronome/contracts";
import { isEntreprisePlanPrefix } from "@app/lib/plans/plan_codes";
import {
  getCreditPurchasePriceId,
  getStripePricingData,
  getStripeSubscription,
  isEnterpriseSubscription,
} from "@app/lib/plans/stripe";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { SupportedCurrency } from "@app/types/currency";
import { isSupportedCurrency } from "@app/types/currency";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { StripePricingData } from "@app/types/stripe/pricing";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export const PostCreditPurchaseRequestBody = z.object({
  amountDollars: z.number(),
});

type PostCreditPurchaseResponseBody = {
  success: boolean;
  creditsAddedMicroUsd: number;
  invoiceId: string | null;
  paymentUrl: string | null;
};

export type GetCreditPurchaseInfoResponseBody = {
  isEnterprise: boolean;
  currency: string;
  discountPercent: number;
  creditPricing: StripePricingData | null;
  creditPurchaseLimits: CreditPurchaseLimits | null;
  billingCycleStartDay: number | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      PostCreditPurchaseResponseBody | GetCreditPurchaseInfoResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  // Only admins can view/purchase credits.
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can access credit purchases.",
      },
    });
  }

  const subscription = auth.subscriptionResource();
  if (
    !subscription?.stripeSubscriptionId &&
    !subscription?.isMetronomeOnlyBilled
  ) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "subscription_not_found",
        message:
          "No active subscription found. Please subscribe to a plan first.",
      },
    });
  }

  const isMetronomeOnly = subscription.isMetronomeOnlyBilled;

  switch (req.method) {
    case "GET": {
      let isEnterprise = false;
      let currency = "usd";
      let creditPurchaseLimits: CreditPurchaseLimits | null = null;
      let billingCycleStartDay: number | null = null;

      if (isMetronomeOnly) {
        isEnterprise = isEntreprisePlanPrefix(subscription.getPlan().code);
        creditPurchaseLimits = await getCreditPurchaseLimits(auth, {
          type: "metronome",
          subscription,
        });

        // Bill in the same currency as the contract / Stripe customer.
        const workspace = auth.getNonNullableWorkspace();
        if (workspace.metronomeCustomerId) {
          const currencyResult =
            await resolveCurrencyForExistingMetronomeCustomer({
              metronomeCustomerId: workspace.metronomeCustomerId,
              stripeSubscriptionId: null,
            });
          if (currencyResult.isErr()) {
            logger.warn(
              {
                workspaceId: workspace.sId,
                error: currencyResult.error.message,
              },
              "[Credit Purchase] Failed to resolve currency for Metronome-only workspace, defaulting to usd"
            );
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message:
                  "Failed to resolve billing currency for this workspace.",
              },
            });
          }
          currency = currencyResult.value;
        }

        if (subscription.startDate) {
          billingCycleStartDay = new Date(subscription.startDate).getUTCDate();
        }
      } else {
        const stripeSubscription = await getStripeSubscription(
          subscription.stripeSubscriptionId!
        );

        if (stripeSubscription) {
          isEnterprise = isEnterpriseSubscription(stripeSubscription);
          currency = isSupportedCurrency(stripeSubscription.currency)
            ? stripeSubscription.currency
            : "usd";
          creditPurchaseLimits = await getCreditPurchaseLimits(auth, {
            type: "stripe-subscription",
            stripeSubscription,
          });
        }

        // Get billingCycleStartDay from subscription start date (use UTC to match client-side).
        // Prioritize subscription.startDate to align with getBillingCycle used in the header.
        if (subscription.startDate) {
          billingCycleStartDay = new Date(subscription.startDate).getUTCDate();
        } else if (stripeSubscription?.current_period_start) {
          billingCycleStartDay = new Date(
            stripeSubscription.current_period_start * 1000
          ).getUTCDate();
        }
      }

      const programmaticConfig =
        await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);
      const discountPercent = programmaticConfig?.defaultDiscountPercent ?? 0;

      const creditPricing = await getStripePricingData(
        getCreditPurchasePriceId()
      );

      return res.status(200).json({
        isEnterprise,
        currency,
        discountPercent,
        creditPricing,
        creditPurchaseLimits,
        billingCycleStartDay,
      });
    }

    case "POST": {
      const workspace = auth.getNonNullableWorkspace();
      const bodyValidation = PostCreditPurchaseRequestBody.safeParse(req.body);
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

      const { amountDollars } = bodyValidation.data;

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

      // Convert dollars to micro USD for internal storage.
      const amountMicroUsd = Math.round(amountDollars * 1_000_000);

      // Resolve enterprise + limits depending on the billing path.
      let isEnterprise: boolean;
      let limits: CreditPurchaseLimits;
      let metronomeStripeCustomerId: string | null = null;
      let metronomeCurrency: SupportedCurrency = "usd";

      if (isMetronomeOnly) {
        isEnterprise = isEntreprisePlanPrefix(subscription.getPlan().code);
        limits = await getCreditPurchaseLimits(auth, {
          type: "metronome",
          subscription,
        });

        // Resolve the Stripe customer linked to the Metronome customer's
        // billing config — this is where we'll issue the one-off invoice.
        if (!workspace.metronomeCustomerId) {
          logger.error(
            { workspaceId: workspace.sId },
            "[Credit Purchase] Metronome-only workspace has no metronomeCustomerId"
          );
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "Workspace is not provisioned in Metronome.",
            },
          });
        }
        const stripeCustomerIdResult =
          await getMetronomeCustomerStripeCustomerId(
            workspace.metronomeCustomerId
          );
        if (stripeCustomerIdResult.isErr() || !stripeCustomerIdResult.value) {
          logger.error(
            {
              workspaceId: workspace.sId,
              metronomeCustomerId: workspace.metronomeCustomerId,
              error: stripeCustomerIdResult.isErr()
                ? stripeCustomerIdResult.error.message
                : "no stripe billing config",
            },
            "[Credit Purchase] Failed to resolve Stripe customer for Metronome-only workspace"
          );
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message:
                "No Stripe billing configuration found for this workspace.",
            },
          });
        }
        metronomeStripeCustomerId = stripeCustomerIdResult.value;

        // Bill in the same currency as the contract / Stripe customer.
        const currencyResult =
          await resolveCurrencyForExistingMetronomeCustomer({
            metronomeCustomerId: workspace.metronomeCustomerId,
            stripeSubscriptionId: null,
          });
        if (currencyResult.isErr()) {
          logger.error(
            {
              workspaceId: workspace.sId,
              error: currencyResult.error.message,
            },
            "[Credit Purchase] Failed to resolve currency for Metronome-only workspace"
          );
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "Failed to resolve billing currency for this workspace.",
            },
          });
        }
        metronomeCurrency = currencyResult.value;
      } else {
        const stripeSubscription = await getStripeSubscription(
          subscription.stripeSubscriptionId!
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
        isEnterprise = isEnterpriseSubscription(stripeSubscription);
        limits = await getCreditPurchaseLimits(auth, {
          type: "stripe-subscription",
          stripeSubscription,
        });
      }

      if (!limits.canPurchase) {
        const message =
          limits.reason === "trialing"
            ? "Credit purchases are not available during trial. Please contact support."
            : "Credit purchases require an active subscription. Please ensure your payment method is up to date.";
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message,
          },
        });
      }

      if (amountMicroUsd > limits.maxAmountMicroUsd) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Amount exceeds maximum allowed: $${limits.maxAmountMicroUsd / 1_000_000}. Please contact support for higher limits.`,
          },
        });
      }

      // Fetch discount from programmatic usage configuration.
      const programmaticConfig =
        await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);
      let discountPercent =
        programmaticConfig?.defaultDiscountPercent &&
        programmaticConfig.defaultDiscountPercent > 0
          ? programmaticConfig.defaultDiscountPercent
          : undefined;

      // Validate discount does not exceed maximum (should be enforced at config level, but double-check).
      if (
        discountPercent !== undefined &&
        discountPercent > MAX_DISCOUNT_PERCENT
      ) {
        logger.error(
          {
            workspaceId: workspace.sId,
            discountPercent,
            maxDiscountPercent: MAX_DISCOUNT_PERCENT,
          },
          "[Credit Purchase] Discount exceeds maximum allowed"
        );
        discountPercent = undefined;
      }

      const user = auth.getNonNullableUser();

      const billingTarget: CreditPurchaseBillingTarget =
        isMetronomeOnly && metronomeStripeCustomerId
          ? {
              type: "metronome",
              stripeCustomerId: metronomeStripeCustomerId,
              currency: metronomeCurrency,
            }
          : {
              type: "stripe-subscription",
              stripeSubscriptionId: subscription.stripeSubscriptionId!,
            };

      if (isEnterprise) {
        const result = await createEnterpriseCreditPurchase({
          auth,
          billingTarget,
          amountMicroUsd,
          discountPercent,
          boughtByUserId: user.id,
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
        billingTarget,
        amountMicroUsd,
        discountPercent,
        boughtByUserId: user.id,
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
