/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import {
  PostPokeStripeCustomerCurrencyBodySchema,
  type PostPokeStripeCustomerCurrencyResponseBody,
} from "@app/lib/api/poke/stripe_customers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { resolveCurrencyFromStripe } from "@app/lib/plans/billing_currency";
import { getStripeCustomer } from "@app/lib/plans/stripe";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PostPokeStripeCustomerCurrencyResponseBody>
  >,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(session, null);

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const validation = PostPokeStripeCustomerCurrencyBodySchema.safeParse(
    req.body
  );
  if (!validation.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `The request body is invalid: ${fromError(validation.error).toString()}`,
      },
    });
  }

  const { stripeCustomerId } = validation.data;
  const stripeCustomer = await getStripeCustomer(stripeCustomerId);
  if (!stripeCustomer) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "invalid_request_error",
        message: `Stripe customer not found: ${stripeCustomerId}.`,
      },
    });
  }

  const currency = resolveCurrencyFromStripe({ stripeCustomer });
  return res.status(200).json({ currency });
}

export default withSessionAuthenticationForPoke(handler);
