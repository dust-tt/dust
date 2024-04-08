import type { WithAPIErrorReponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";
import type Stripe from "stripe";

import { Authenticator, getSession } from "@app/lib/auth";
import type { StripeSubscriptionValidityType } from "@app/lib/plans/stripe";
import { getStripeSubscription } from "@app/lib/plans/stripe";
import { assertStripeSubscriptionValid } from "@app/lib/plans/stripe";
import { getSubscriptionForStripeId } from "@app/lib/plans/subscription";
import { apiError, withLogging } from "@app/logger/withlogging";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorReponse<StripeSubscriptionValidityType>>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

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

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only Dust super users can access this endpoint.",
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

  if (req.query.checkSubscriptionUnassigned) {
    if (
      typeof req.query.checkSubscriptionUnassigned !== "string" ||
      !["true", "false"].includes(req.query.checkSubscriptionUnassigned)
    ) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Invalid request, checkSubscriptionUnassigned must be a boolean.",
        },
      });
    }

    const checkSubscriptionUnassigned =
      req.query.checkSubscriptionUnassigned === "true";

    if (checkSubscriptionUnassigned) {
      // check if a subscription with the same stripeSubscriptionId is already in our database
      if (await getSubscriptionForStripeId(stripeSubscriptionId)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "A Dust subscription with the same stripeSubscriptionId already exists.",
          },
        });
      }
    }
  }

  switch (req.method) {
    case "GET": {
      return res
        .status(200)
        .json(assertStripeSubscriptionValid(stripeSubscription));
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
