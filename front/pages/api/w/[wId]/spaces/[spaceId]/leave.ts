import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";

interface PostLeaveProjectResponseBody {
  success: boolean;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostLeaveProjectResponseBody>>,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  switch (req.method) {
    case "POST": {
      // Only allow leaving projects
      if (!space.isProject()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "You can only leave projects, not regular spaces.",
          },
        });
      }

      // Check if user is a member of the project
      if (!space.isMember(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "You are not a member of this project.",
          },
        });
      }

      const user = auth.getNonNullableUser();

      // Get the member group (kind: "regular") and editor group (kind: "space_editors")
      const memberGroup = space.groups.find((g) => g.kind === "regular");
      const editorGroup = space.groups.find((g) => g.kind === "space_editors");

      // Check if user is in the editor group and if they're the last editor
      if (editorGroup) {
        const activeEditors = await editorGroup.getActiveMembers(auth);
        const isUserEditor = activeEditors.some((m) => m.sId === user.sId);

        if (isUserEditor && activeEditors.length === 1) {
          return apiError(req, res, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message:
                "You cannot leave this project as you are the last editor. Please add another editor first.",
            },
          });
        }
      }

      const groupsToLeave = [memberGroup, editorGroup].filter(
        (g): g is NonNullable<typeof g> => g !== undefined
      );

      for (const group of groupsToLeave) {
        const result = await group.leaveGroup(auth);
        if (result.isErr() && result.error.code !== "user_not_member") {
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: result.error.message,
            },
          });
        }
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
