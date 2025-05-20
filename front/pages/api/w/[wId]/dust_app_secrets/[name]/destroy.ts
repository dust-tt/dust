import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getDustAppSecret } from "@app/lib/api/dust_app_secrets";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { DustAppSecretType } from "@app/types";
import type { WithAPIErrorResponse } from "@app/types";

export type PostDustAppSecretsResponseBody = {
  secret: DustAppSecretType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostDustAppSecretsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (!auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `builders` for the current workspace can manage secrets.",
      },
    });
  }

  const secret = await getDustAppSecret(auth, <string>req.query.name);

  if (secret == null) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "dust_app_secret_not_found",
        message: "Workspace not found.",
      },
    });
  }

  switch (req.method) {
    case "DELETE":
      if (!auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: "You do not have the required permissions.",
          },
        });
      }
      await secret.destroy();
      res.status(204).end();
      return;
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

export default withSessionAuthenticationForWorkspace(handler);
