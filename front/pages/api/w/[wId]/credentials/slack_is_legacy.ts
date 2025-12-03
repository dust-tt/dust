import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import apiConfig from "@app/lib/api/config";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString, OAuthAPI } from "@app/types";

export type GetSlackClientIdResponseBody = {
  isLegacy: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetSlackClientIdResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

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

  const { credentialId } = req.query;
  if (!isString(credentialId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid credential id.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const oauthApi = new OAuthAPI(apiConfig.getOAuthAPIConfig(), logger);
      const credentialRes = await oauthApi.getCredentials({
        credentialsId: credentialId,
      });

      if (credentialRes.isErr()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "invalid_request_error",
            message: "The credential you requested was not found.",
          },
        });
      }

      const { credential } = credentialRes.value;

      if (credential.metadata.workspace_id !== owner.sId) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "invalid_request_error",
            message: "The credential you requested was not found.",
          },
        });
      }

      if (credential.provider !== "slack") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The credential provided is not a Slack credential.",
          },
        });
      }

      const clientId = getClientId(credential.content);
      const oauthClientId = config.getOAuthSlackClientId();

      return res.status(200).json({ isLegacy: clientId === oauthClientId });
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

function getClientId(content: unknown): string | null {
  if (
    content !== null &&
    typeof content === "object" &&
    "client_id" in content &&
    isString(content["client_id"])
  ) {
    return content["client_id"];
  }
  return null;
}

export default withSessionAuthenticationForWorkspace(handler);
