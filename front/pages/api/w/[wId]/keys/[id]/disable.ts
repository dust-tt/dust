import type { KeyType, WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { KeyResource } from "@app/lib/resources/key_resource";
import { apiError } from "@app/logger/withlogging";

export type PostKeysResponseBody = {
  key: KeyType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostKeysResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message:
          "Only the users that are `admins` for the current workspace can disable a key.",
      },
    });
  }

  const { id } = req.query;
  if (typeof id !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid key id",
      },
    });
  }

  const key = await KeyResource.fetchByWorkspaceAndId(owner, id);

  if (!key) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "key_not_found",
        message: "Could not find the key.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      await key.setIsDisabled();

      res.status(200).json({
        key: {
          ...key.toJSON(),
          status: "disabled",
        },
      });
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
