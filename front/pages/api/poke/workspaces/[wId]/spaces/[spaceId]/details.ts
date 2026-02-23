import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { getMembers } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { spaceToPokeJSON } from "@app/lib/poke/utils";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { PokeSpaceType } from "@app/types/poke";
import type { UserTypeWithWorkspaces } from "@app/types/user";
import type { NextApiRequest, NextApiResponse } from "next";

export type PokeGetSpaceDetails = {
  members: Record<string, UserTypeWithWorkspaces[]>;
  space: PokeSpaceType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeGetSpaceDetails>>,
  session: SessionWithUser
): Promise<void> {
  const { wId, spaceId } = req.query;
  if (typeof wId !== "string" || typeof spaceId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid workspace or space ID.",
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
      const space = await SpaceResource.fetchById(auth, spaceId);
      if (!space) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "space_not_found",
            message: "Space not found.",
          },
        });
      }

      const members: Record<string, UserTypeWithWorkspaces[]> = {};

      const allGroups = space.groups.filter((g) =>
        space.managementMode === "manual"
          ? g.kind === "regular" || g.kind === "space_editors"
          : g.kind === "provisioned"
      );

      const memberships = await getMembers(auth);

      for (const group of allGroups) {
        const groupMembers = await group.getActiveMembers(auth);
        members[group.name] = groupMembers.reduce<UserTypeWithWorkspaces[]>(
          (acc, user) => {
            const member = memberships.members.find((m) => m.sId === user.sId);

            if (member) {
              acc.push(member);
            }

            return acc;
          },
          []
        );
      }

      return res.status(200).json({
        members,
        space: spaceToPokeJSON(space),
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
