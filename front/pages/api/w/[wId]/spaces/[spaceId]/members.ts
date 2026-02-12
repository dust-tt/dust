import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { notifyProjectMembersAdded } from "@app/lib/notifications/workflows/project-added-as-member";
import { GroupSpaceMemberResource } from "@app/lib/resources/group_space_member_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { auditLog } from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { SpaceType } from "@app/types/space";

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
      editorIds: t.array(t.string),
    }),
    t.type({
      groupIds: t.array(t.string),
      managementMode: t.literal("group"),
      editorGroupIds: t.array(t.string),
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
  if (!space.isRegular() && !space.isProject()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only projects and regular spaces can have members.",
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

      // Track current members before update to identify newly added ones.
      let currentMemberIds: Set<string> | undefined;
      const body = bodyValidation.right;
      if (space.isProject() && body.managementMode === "manual") {
        const memberGroupSpaces = await GroupSpaceMemberResource.fetchBySpace({
          space,
          filterOnManagementMode: true,
        });
        if (memberGroupSpaces.length === 1) {
          const currentMembers =
            await memberGroupSpaces[0].group.getActiveMembers(auth);
          currentMemberIds = new Set(currentMembers.map((m) => m.sId));
        }
      }

      const updateRes = await space.updatePermissions(auth, body);
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
          case "group_requirements_not_met":
            return apiError(req, res, {
              status_code: 403,
              api_error: {
                type: "workspace_auth_error",
                message:
                  "Some users have insufficient role privilege to be added to the space.",
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

      // Audit log when an admin who is not a member of the space updates its permissions.
      if (!space.canRead(auth)) {
        const user = auth.user();
        auditLog(
          {
            author: user ? user.toJSON() : "no-author",
            workspaceId: auth.getNonNullableWorkspace().sId,
            spaceId: space.sId,
            spaceName: space.name,
            action: "space_permissions_updated_by_non_member",
          },
          "[Security] Admin updated space permissions without being a member"
        );
      }

      // Trigger notifications for newly added members (projects only).
      if (
        space.isProject() &&
        body.managementMode === "manual" &&
        currentMemberIds
      ) {
        const newlyAddedUserIds = body.memberIds.filter(
          (id) => !currentMemberIds.has(id)
        );
        if (newlyAddedUserIds.length > 0) {
          notifyProjectMembersAdded(auth, {
            project: space.toJSON(),
            addedUserIds: newlyAddedUserIds,
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

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
