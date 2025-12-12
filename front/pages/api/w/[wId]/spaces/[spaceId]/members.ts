import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { SpaceType, WithAPIErrorResponse } from "@app/types";
import { assertNever } from "@app/types";

interface PatchSpaceMembersResponseBody {
  space: SpaceType;
}

const PatchSpaceMembersRequestBodySchema = t.intersection([
  t.type({
    isRestricted: t.boolean,
    name: t.string,
  }),
  t.union([
    t.type({
      memberIds: t.array(t.string),
      managementMode: t.literal("manual"),
    }),
    t.type({
      groupIds: t.array(t.string),
      managementMode: t.literal("group"),
    }),
  ]),
]);

export type PatchSpaceMembersRequestBodyType = t.TypeOf<
  typeof PatchSpaceMembersRequestBodySchema
>;

export async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PatchSpaceMembersResponseBody>>,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
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
      if (!space.canAdministrate(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message:
              "Only users that are `admins` can administrate space members.",
          },
        });
      }

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
        switch (updateRes.error.code) {
          case "unauthorized":
            return apiError(req, res, {
              status_code: 401,
              api_error: {
                type: "workspace_auth_error",
                message:
                  "Only users that are `admins` can administrate space members.",
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
          case "user_not_member":
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: "The user is not a member of the workspace.",
              },
            });
          case "group_not_found":
            return apiError(req, res, {
              status_code: 404,
              api_error: {
                type: "group_not_found",
                message: "The group was not found in the workspace.",
              },
            });
          case "user_already_member":
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: "The user is already a member of the space.",
              },
            });
          case "invalid_id":
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: "Some of the passed ids are invalid.",
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

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
