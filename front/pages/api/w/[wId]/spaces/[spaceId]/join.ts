import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { GroupSpaceMemberResource } from "@app/lib/resources/group_space_member_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

interface PostJoinProjectResponseBody {
  success: boolean;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostJoinProjectResponseBody>>,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  switch (req.method) {
    case "POST": {
      if (!space.isProject()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "You can only join projects, not regular spaces.",
          },
        });
      }

      if (space.isProjectAndRestricted()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message:
              "This project is restricted. You need to be invited to join.",
          },
        });
      }

      if (space.managementMode !== "manual") {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "invalid_request_error",
            message:
              "You cannot join this project, its members are not managed manually.",
          },
        });
      }

      if (space.isMember(auth)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "You are already a member of this project.",
          },
        });
      }

      const memberGroupSpaces = await GroupSpaceMemberResource.fetchBySpace({
        space,
        filterOnManagementMode: true,
      });

      if (memberGroupSpaces.length !== 1) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message:
              "There should be exactly one member group for the project.",
          },
        });
      }

      const memberGroupSpace = memberGroupSpaces[0];
      const user = auth.getNonNullableUser();
      const result = await memberGroupSpace.addMembers(auth, {
        users: [user.toJSON()],
      });
      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: result.error.message,
          },
        });
      }

      return res.status(200).json({ success: true });
    }

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

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
