import type { DustAppSecretType } from "@dust-tt/types";
import type { WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getDustAppSecret } from "@app/lib/api/dust_app_secrets";
import { withSessionAuthentication } from "@app/lib/api/wrappers";
import { Authenticator, getSession } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

export type PostDustAppSecretsResponseBody = {
  secret: DustAppSecretType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostDustAppSecretsResponseBody>>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Workspace not found.",
      },
    });
    return;
  }

  if (!auth.isBuilder()) {
    apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `builders` for the current workspace can manage secrets.",
      },
    });
    return;
  }

  const secret = await getDustAppSecret(auth, <string>req.query.name);

  if (secret == null) {
    apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "dust_app_secret_not_found",
        message: "Workspace not found.",
      },
    });
    return;
  }

  switch (req.method) {
    case "DELETE":
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
      return;
  }
}

export default withSessionAuthentication(handler);
