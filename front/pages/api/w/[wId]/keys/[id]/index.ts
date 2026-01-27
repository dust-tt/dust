import { isLeft } from "fp-ts/Either";
import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { KeyResource } from "@app/lib/resources/key_resource";
import { apiError } from "@app/logger/withlogging";
import type { KeyType, WithAPIErrorResponse } from "@app/types";

export type PatchKeyResponseBody = {
  key: KeyType;
};

const PatchKeyBodySchema = t.type({
  monthlyCapMicroUsd: t.union([t.number, t.null]),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PatchKeyResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message:
          "Only the users that are `admins` for the current workspace can update a key.",
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
    case "PATCH": {
      const bodyValidation = PatchKeyBodySchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Invalid request body: monthlyCapMicroUsd must be a number or null.",
          },
        });
      }

      const { monthlyCapMicroUsd } = bodyValidation.right;

      if (monthlyCapMicroUsd !== null && monthlyCapMicroUsd < 0) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "monthlyCapMicroUsd must be greater than or equal to 0.",
          },
        });
      }

      await key.updateMonthlyCap({ monthlyCapMicroUsd });

      res.status(200).json({
        key: key.toJSON(),
      });
      return;
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, PATCH is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
