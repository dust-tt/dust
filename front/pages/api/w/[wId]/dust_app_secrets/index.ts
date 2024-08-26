import type { DustAppSecretType, WithAPIErrorResponse } from "@dust-tt/types";
import { encrypt, rateLimiter } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  getDustAppSecret,
  getDustAppSecrets,
} from "@app/lib/api/dust_app_secrets";
import { withSessionAuthenticationForWorkspaceAsUser } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DustAppSecret } from "@app/lib/models/workspace";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export type GetDustAppSecretsResponseBody = {
  secrets: DustAppSecretType[];
};

export type PostDustAppSecretsResponseBody = {
  secret: DustAppSecretType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetDustAppSecretsResponseBody | PostDustAppSecretsResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  const user = auth.user();
  if (!user) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace or user is missing.",
      },
    });
  }

  if (!auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "You do not have the required permissions.",
      },
    });
  }

  const remaining = await rateLimiter({
    key: `workspace:${owner.id}:dust_app_secrets`,
    maxPerTimeframe: 60,
    timeframeSeconds: 60,
    logger,
  });

  if (remaining < 0) {
    return apiError(req, res, {
      status_code: 429,
      api_error: {
        type: "rate_limit_error",
        message: "You have reached the rate limit for this workspace.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const secrets = await getDustAppSecrets(auth);

      res.status(200).json({
        secrets,
      });
      return;

    case "POST":
      const { name: postSecretName } = req.body;
      const secretValue = req.body.value;

      const encryptedValue = encrypt(secretValue, owner.sId); // We feed the workspace sid as key that will be added to the salt.

      let postSecret = await getDustAppSecret(auth, postSecretName);

      if (postSecret) {
        await postSecret.update({
          hash: encryptedValue,
        });
      } else {
        postSecret = await DustAppSecret.create({
          userId: user.id,
          workspaceId: owner.id,
          name: postSecretName,
          hash: encryptedValue,
        });
      }

      res.status(201).json({
        secret: {
          name: postSecretName,
          value: secretValue,
        },
      });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET, POST or DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspaceAsUser(handler);
