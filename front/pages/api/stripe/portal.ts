import type { ReturnedAPIErrorType } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { createCustomerPortalSession } from "@app/lib/plans/stripe";
import { apiError, withLogging } from "@app/logger/withlogging";

const PostStripePortalRequestBody = t.type({
  workspaceId: t.string,
});
type PostStripePortalResponseBody = {
  portalUrl: string;
};
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PostStripePortalResponseBody | ReturnedAPIErrorType>
): Promise<void> {
  const bodyValidation = PostStripePortalRequestBody.decode(req.body);
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

  const workspaceId = bodyValidation.right.workspaceId;
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(session, workspaceId);

  const owner = auth.workspace();
  const subscription = auth.subscription();
  if (!owner || !subscription) {
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
          "Only users that are `admins` for the current workspace can see the subscription or modify it.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const portalUrl = await createCustomerPortalSession({
        owner,
        subscription,
      });
      if (portalUrl) {
        res.status(200).json({ portalUrl });
        return;
      }
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message:
            "Stripe API: An error occured while fetching the customer portal url.",
        },
      });

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
