import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import apiConfig from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { OAuthAPI } from "@app/types/oauth/oauth_api";

type DeleteCredentialsResponseBody = void;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<DeleteCredentialsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { credentialsId } = req.query;
  if (typeof credentialsId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message:
          "Only the users that are `admins` for the current workspace can interact with credentials.",
      },
    });
  }

  switch (req.method) {
    case "DELETE": {
      const response = await new OAuthAPI(
        apiConfig.getOAuthAPIConfig(),
        logger
      ).deleteCredentials({
        credentialsId,
      });

      if (response.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "connector_credentials_error",
            message: `Failed to delete credentials: ${response.error.message}.`,
          },
        });
      }

      res.status(204).end();
      return;
    }

    default:
      res.status(405).end();
      return;
  }
}

export default withSessionAuthenticationForWorkspace(handler);
