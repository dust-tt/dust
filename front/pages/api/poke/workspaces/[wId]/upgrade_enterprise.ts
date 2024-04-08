import type { WithAPIErrorReponse } from "@dust-tt/types";
import { EnterpriseSubscriptionFormSchema } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { pokeUpgradeWorkspaceToEnterprise } from "@app/lib/plans/subscription";
import { apiError, withLogging } from "@app/logger/withlogging";

export interface UpgradeEnterpriseSuccessResponseBody {
  success: boolean;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorReponse<UpgradeEnterpriseSuccessResponseBody>
  >
): Promise<void> {
  const session = await getSession(req, res);
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

  switch (req.method) {
    case "POST":
      const bodyValidation = EnterpriseSubscriptionFormSchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `The request body is invalid: ${pathError}`,
          },
        });
      }
      const body = bodyValidation.right;

      const stripeSubscriptionId = body.stripeSubscriptionId;

      // We validate that the stripe subscription is correctly configured
      const isValidStripeSubscriptionId = stripeSubscriptionId === "soupinou"; // Todo replace with actual stripe subscription id business logic
      if (!isValidStripeSubscriptionId) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The stripe subscription id is invalid.",
          },
        });
      }

      // If yes, we will create the new plan and attach it to the workspace with a new subscription
      try {
        await pokeUpgradeWorkspaceToEnterprise(auth, body);
      } catch (error) {
        const errorString =
          error instanceof Error
            ? error.message
            : JSON.stringify(error, null, 2);

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: errorString,
          },
        });
      }

      res.status(200).json({
        success: true,
      });
      break;

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
