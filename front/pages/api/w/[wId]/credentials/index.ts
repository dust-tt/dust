import type { WithAPIErrorResponse } from "@dust-tt/types";
import {
  postConnectionCredentials,
  PostCredentialsBodySchema,
} from "@dust-tt/types";
import { isLeft } from "fp-ts/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import apiConfig from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

type PostCredentialsResponseBody = {
  credentials: {
    id: string;
  };
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostCredentialsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const user = auth.getNonNullableUser();
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

  switch (req.method) {
    case "POST":
      const bodyValidation = PostCredentialsBodySchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `The request body is invalid: ${pathError}.`,
          },
        });
      }
      const response = await postConnectionCredentials({
        config: apiConfig.getOAuthAPIConfig(),
        logger,
        workspaceId: owner.sId,
        userId: user.sId,
        provider: bodyValidation.right.provider,
        credentials: bodyValidation.right.credentials,
      });

      if (response.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "connector_credentials_error",
            message: `Failed to create credentials: ${response.error.message}.`,
          },
        });
      }

      res.status(201).json({
        credentials: {
          id: response.value.credential.credential_id,
        },
      });
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withSessionAuthenticationForWorkspace(handler);
