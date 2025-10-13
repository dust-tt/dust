import type {
  GetSpaceMembersResponseBody,
  PostSpaceMembersResponseBody,
} from "@dust-tt/client";
import { PostSpaceMembersRequestBodySchema } from "@dust-tt/client";
import uniqBy from "lodash/uniqBy";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { assertNever, isString } from "@app/types";

/**
 * @ignoreswagger
 * Admin-only endpoint. Undocumented.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      PostSpaceMembersResponseBody | GetSpaceMembersResponseBody
    >
  >,
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

  const { spaceId } = req.query;
  if (!spaceId || !isString(spaceId)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "The space was not found.",
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

  if (
    space.managementMode === "group" ||
    space.groups.some((g) => g.kind === "global")
  ) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message:
          space.managementMode === "group"
            ? "Space is managed by provisioned group access, members can't be edited by API."
            : "Non-restricted space's members can't be edited.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const currentMembers = uniqBy(
        (
          await concurrentExecutor(
            space.groups,
            (group) => group.getActiveMembers(auth),
            { concurrency: 1 }
          )
        ).flat(),
        "sId"
      );

      return res.status(200).json({
        users: currentMembers.map((member) => ({
          sId: member.sId,
          email: member.email,
        })),
      });

    case "POST": {
      const bodyValidation = PostSpaceMembersRequestBodySchema.safeParse(
        req.body
      );

      if (!bodyValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${bodyValidation.error.message}`,
          },
        });
      }

      const { userIds } = bodyValidation.data;

      const updateRes = await space.addMembers(auth, {
        userIds: userIds,
      });
      if (updateRes.isErr()) {
        switch (updateRes.error.code) {
          case "unauthorized":
            return apiError(req, res, {
              status_code: 401,
              api_error: {
                type: "workspace_auth_error",
                message: "You are not authorized to update the space.",
              },
            });
          case "user_already_member":
            return apiError(req, res, {
              status_code: 409,
              api_error: {
                type: "invalid_request_error",
                message: "The user is already a member of the space.",
              },
            });
          case "user_not_found":
            return apiError(req, res, {
              status_code: 404,
              api_error: {
                type: "user_not_found",
                message: "The user was not found in the workspace.",
              },
            });
          case "system_or_global_group":
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message:
                  "Users cannot be removed from system or global groups.",
              },
            });
          default:
            assertNever(updateRes.error.code);
        }
      }

      const usersJson = updateRes.value.map((user) => user.toJSON());

      return res.status(200).json({
        space: space.toJSON(),
        users: usersJson.map((userJson) => ({
          sId: userJson.sId,
          id: userJson.id,
          email: userJson.email,
        })),
      });
    }
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

export default withPublicAPIAuthentication(handler);
