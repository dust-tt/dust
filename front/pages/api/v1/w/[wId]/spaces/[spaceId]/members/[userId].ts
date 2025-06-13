import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  apiError,
  dustErrorToApiErrorType,
  dustErrorToHttpStatusCode,
} from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { assertNever, isString } from "@app/types";

/**
 * @ignoreswagger
 * Admin-only endpoint. Undocumented.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<void>>,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only users that are `admins` can access this endpoint.",
      },
    });
  }

  const { spaceId, userId } = req.query;
  if (!spaceId || !isString(spaceId)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "The space was not found.",
      },
    });
  }

  if (!userId || !isString(userId)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "The user in the space was not found.",
      },
    });
  }

  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "The space was not found.",
      },
    });
  }

  switch (req.method) {
    case "DELETE": {
      const updateRes = await space.removeMembers(auth, {
        userIds: [userId],
      });
      if (updateRes.isErr()) {
        switch (updateRes.error.code) {
          case "unauthorized":
            return apiError(req, res, {
              status_code: dustErrorToHttpStatusCode(updateRes),
              api_error: {
                type: dustErrorToApiErrorType(updateRes),
                message: "You are not authorized to update the space.",
              },
            });
          case "user_not_member":
            return apiError(req, res, {
              status_code: dustErrorToHttpStatusCode(updateRes),
              api_error: {
                type: dustErrorToApiErrorType(updateRes),
                message: "The user is not a member of the space.",
              },
            });
          case "user_not_found":
            return apiError(req, res, {
              status_code: dustErrorToHttpStatusCode(updateRes),
              api_error: {
                type: dustErrorToApiErrorType(updateRes),
                message: "The user was not found in the workspace.",
              },
            });
          case "system_or_global_group":
            return apiError(req, res, {
              status_code: dustErrorToHttpStatusCode(updateRes),
              api_error: {
                type: dustErrorToApiErrorType(updateRes),
                message:
                  "Users cannot be removed from system or global groups.",
              },
            });
          default:
            assertNever(updateRes.error.code);
        }
      }

      return void res.status(200).end();
    }
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, DELETE is expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(handler);
