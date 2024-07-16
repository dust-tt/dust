import type {
  UserTypeWithWorkspaces,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthentication } from "@app/lib/api/wrappers";
import { getSession } from "@app/lib/auth";
import { getUserFromSession } from "@app/lib/iam/session";
import { UserResource } from "@app/lib/resources/user_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export type PostUserMetadataResponseBody = {
  success: boolean;
};

const PatchUserBodySchema = t.type({
  firstName: t.string,
  lastName: t.string,
});

export type GetUserResponseBody = {
  user: UserTypeWithWorkspaces;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PostUserMetadataResponseBody | GetUserResponseBody>
  >
): Promise<void> {
  const session = await getSession(req, res);

  // This functions retrieves the full user including all workspaces.
  const user = await getUserFromSession(session);

  if (!user) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "The user was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      ServerSideTracking.trackGetUser({ user }).catch((err) => {
        logger.error(
          { err: err, userId: user.sId },
          "Failed to track user memberships"
        );
      });
      return res.status(200).json({ user });

    case "PATCH":
      const bodyValidation = PatchUserBodySchema.decode(req.body);
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

      const userRes = await UserResource.fetchNonNullableByModelId(user.id);

      const result = await userRes.updateName(
        req.body.firstName,
        req.body.lastName
      );

      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to update user name.",
          },
        });
      }

      res.status(200).json({
        success: true,
      });
      return;

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

export default withSessionAuthentication(handler);
