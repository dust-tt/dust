/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import type { PokeGetGroupDetails } from "@app/lib/api/poke/groups";
import { getGroupMembersWithWorkspaces } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { GroupResource } from "@app/lib/resources/group_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeGetGroupDetails>>,
  session: SessionWithUser
): Promise<void> {
  const { wId, groupId } = req.query;
  if (typeof wId !== "string" || typeof groupId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid workspace or group ID.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);
  const owner = auth.workspace();

  if (!owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Workspace not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const groupRes = await GroupResource.fetchById(auth, groupId);
      if (groupRes.isErr()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "group_not_found",
            message: "Group not found.",
          },
        });
      }

      const group = groupRes.value;
      const members = await getGroupMembersWithWorkspaces(auth, group);

      return res.status(200).json({
        members,
        group: group.toJSON(),
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForPoke(handler);
