import type { SpaceType, WithAPIErrorResponse } from "@dust-tt/types";
import { PatchSpaceMembersRequestBodySchema } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";

interface PatchSpaceMembersResponseBody {
  space: SpaceType;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PatchSpaceMembersResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { spaceId } = req.query;
  if (typeof spaceId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid space id.",
      },
    });
  }

  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space || space.isConversations()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "The space you requested was not found.",
      },
    });
  }

  if (!space.isRegular()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only regular spaces can have members.",
      },
    });
  }

  switch (req.method) {
    case "PATCH": {
      const bodyValidation = PatchSpaceMembersRequestBodySchema.decode(
        req.body
      );

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

      const updateRes = await space.updatePermissions(
        auth,
        bodyValidation.right
      );
      if (updateRes.isErr()) {
        if (
          updateRes.error instanceof DustError &&
          updateRes.error.code === "unauthorized"
        ) {
          return apiError(req, res, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message:
                "Only users that are `admins` can administrate space members.",
            },
          });
        } else {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: updateRes.error.message,
            },
          });
        }
      }

      return res.status(200).json({ space: space.toJSON() });
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
