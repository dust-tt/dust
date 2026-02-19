import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getMembershipInvitationToken } from "@app/lib/api/invitation";
import type { Authenticator } from "@app/lib/auth";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { PendingInvitationOption } from "@app/types/membership_invitation";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetPendingInvitationsResponseBody = {
  pendingInvitations: PendingInvitationOption[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetPendingInvitationsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const userResource = auth.user();
  if (!userResource) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "not_authenticated",
        message: "User not authenticated.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const invitationResources =
        await MembershipInvitationResource.listPendingForEmail({
          email: userResource.email,
        });

      const pendingInvitations: PendingInvitationOption[] =
        invitationResources.map((invitation) => {
          const workspace = invitation.workspace;

          return {
            workspaceName: workspace.name,
            initialRole: invitation.initialRole,
            createdAt: invitation.createdAt.getTime(),
            token: getMembershipInvitationToken(invitation.toJSON()),
            isExpired: invitation.isExpired(),
          };
        });

      return res.status(200).json({ pendingInvitations });
    }

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

export default withSessionAuthenticationForWorkspace(handler);
