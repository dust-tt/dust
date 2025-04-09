import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthentication } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import {
  assertStripeSubscriptionIsValid,
  getStripeSubscription,
  isEnterpriseSubscription,
} from "@app/lib/plans/stripe";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { EnterpriseUpgradeFormSchema } from "@app/types";

export interface UpgradeEnterpriseSuccessResponseBody {
  success: boolean;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<UpgradeEnterpriseSuccessResponseBody>
  >,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(
    session,
    req.query.wId as string
  );

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Could not find the workspace.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const bodyValidation = EnterpriseUpgradeFormSchema.decode(req.body);
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

      // We validate that the stripe subscription exists and is correctly configured.
      const stripeSubscription = await getStripeSubscription(
        body.stripeSubscriptionId
      );
      if (!stripeSubscription) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The Stripe subscription does not exist.",
          },
        });
      }

      // Ensure that the stripe subscription is either attached to the current workspace
      // or is not attached to any workspace.
      const subscription = await SubscriptionResource.fetchByStripeId(
        auth,
        stripeSubscription.id
      );
      const currentWorkspaceSubscription = auth.subscription();
      const isCurrentWorkspaceSubscription =
        currentWorkspaceSubscription &&
        currentWorkspaceSubscription.stripeSubscriptionId ===
          stripeSubscription.id;

      if (subscription && !isCurrentWorkspaceSubscription) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The subscription is already attached to another workspace.",
          },
        });
      }

      if (!isEnterpriseSubscription(stripeSubscription)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The subscription provided is not an enterprise subscription.",
          },
        });
      }

      const assertValidSubscription =
        assertStripeSubscriptionIsValid(stripeSubscription);
      if (assertValidSubscription.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: assertValidSubscription.error.invalidity_message,
          },
        });
      }

      // If yes, we will create the new plan and attach it to the workspace with a new subscription
      try {
        await SubscriptionResource.pokeUpgradeWorkspaceToEnterprise(auth, body);
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

export default withSessionAuthentication(handler);
