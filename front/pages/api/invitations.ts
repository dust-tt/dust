import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthentication } from "@app/lib/api/auth_wrappers";
import { getMembershipInvitationToken } from "@app/lib/api/invitation";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { getUserFromSession } from "@app/lib/iam/session";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { apiError } from "@app/logger/withlogging";
import type { PendingInvitationOption } from "@app/types/membership_invitation";
import { WithAPIErrorResponse } from "@app/types/error";

export type GetPendingInvitationsLookupResponseBody = {
  pendingInvitations: PendingInvitationOption[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetPendingInvitationsLookupResponseBody>
  >,
  session: SessionWithUser
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const user = await getUserFromSession(session);
  if (!user) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "User not found.",
      },
    });
  }

  const invitationResources =
    await MembershipInvitationResource.listPendingForEmail({
      email: user.email,
    });

  const pendingInvitations: PendingInvitationOption[] = invitationResources.map(
    (invitation) => {
      const workspace = invitation.workspace;

      return {
        workspaceName: workspace.name,
        initialRole: invitation.initialRole,
        createdAt: invitation.createdAt.getTime(),
        token: getMembershipInvitationToken(invitation.toJSON()),
        isExpired: invitation.isExpired(),
      };
    }
  );

  return res.status(200).json({ pendingInvitations });
}

export default withSessionAuthentication(handler);
