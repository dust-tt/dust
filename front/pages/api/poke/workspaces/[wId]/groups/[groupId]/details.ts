import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { getMembers } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { GroupResource } from "@app/lib/resources/group_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { GroupType } from "@app/types/groups";
import type { UserTypeWithWorkspaces } from "@app/types/user";

export type PokeGetGroupDetails = {
  members: UserTypeWithWorkspaces[];
  group: GroupType;
};

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

      const groupMembers = await group.getActiveMembers(auth);
      const memberships = await getMembers(auth);

      const userWithWorkspaces = groupMembers.reduce<UserTypeWithWorkspaces[]>(
        (acc, user) => {
          const member = memberships.members.find((m) => m.sId === user.sId);

          if (member) {
            acc.push(member);
          }

          return acc;
        },
        []
      );

      return res.status(200).json({
        members: userWithWorkspaces,
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
