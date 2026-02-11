import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { getMembershipInvitationUrl } from "@app/lib/api/invitation";
import { getMembers } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { MembershipInvitationTypeWithLink } from "@app/types/membership_invitation";
import type { UserTypeWithWorkspaces } from "@app/types/user";

export type PokeGetMemberships = {
  members: UserTypeWithWorkspaces[];
  pendingInvitations: MembershipInvitationTypeWithLink[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeGetMemberships>>,
  session: SessionWithUser
): Promise<void> {
  const { wId } = req.query;
  if (typeof wId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid workspace ID.",
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
      const [{ members }, pendingInvitations] = await Promise.all([
        getMembers(auth),
        MembershipInvitationResource.getPendingInvitations(auth, {
          includeExpired: true,
        }),
      ]);

      return res.status(200).json({
        members,
        pendingInvitations: pendingInvitations.map((invite) => {
          const i = invite.toJSON();
          return {
            ...i,
            inviteLink: getMembershipInvitationUrl(owner, i),
          };
        }),
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
