import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import {
  getDustAppSecret,
  getDustAppSecrets,
} from "@app/lib/api/dust_app_secrets";
import type { Authenticator } from "@app/lib/auth";
import { DustAppSecret } from "@app/lib/models/dust_app_secret";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { DustAppSecretType, WithAPIErrorResponse } from "@app/types";
import { encrypt } from "@app/types";

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
  if (!auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "You do not have the required permissions.",
      },
    });
  }

  const owner = auth.getNonNullableWorkspace();
  const user = auth.getNonNullableUser();

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
      if (!auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: "You do not have the required permissions.",
          },
        });
      }
      const secrets = await getDustAppSecrets(auth);

      res.status(200).json({
        secrets,
      });
      return;

    case "POST":
      if (!auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: "You do not have the required permissions.",
          },
        });
      }

      const { name: postSecretName } = req.body;
      const secretValue = req.body.value;

      // Sanitize the secret name to be alphanumeric and underscores only
      const sanitizedSecretName = postSecretName.replace(/[^a-zA-Z0-9_]/g, "_");

      const encryptedValue = encrypt(secretValue, owner.sId); // We feed the workspace sid as key that will be added to the salt.

      let postSecret = await getDustAppSecret(auth, sanitizedSecretName);

      if (postSecret) {
        await postSecret.update({
          hash: encryptedValue,
        });
      } else {
        postSecret = await DustAppSecret.create({
          userId: user.id,
          workspaceId: owner.id,
          name: sanitizedSecretName,
          hash: encryptedValue,
        });
      }

      res.status(201).json({
        secret: {
          name: sanitizedSecretName,
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
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
