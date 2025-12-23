import isString from "lodash/isString";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import type { HandleMembershipInvitationResult } from "@app/lib/api/invitation";
import { handleMembershipInvitations } from "@app/lib/api/invitation";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<HandleMembershipInvitationResult>>,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  const user = auth.user();
  if (!owner || !user || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  const invitationId = req.query.iId;
  if (!isString(invitationId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `iId` (string) is required.",
      },
    });
  }

  const workspaceAdminAuth = await Authenticator.internalAdminForWorkspace(
    owner.sId
  );

  const subscription = workspaceAdminAuth.subscription();
  if (!subscription) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The subscription was not found.",
      },
    });
  }

  const invitation = await MembershipInvitationResource.fetchById(
    workspaceAdminAuth,
    invitationId
  );
  if (!invitation) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "invitation_not_found",
        message: "The invitation was not found.",
      },
    });
  }

  switch (req.method) {
    case "PATCH": {
      const invitationRes = await handleMembershipInvitations(
        workspaceAdminAuth,
        {
          owner,
          user: user.toJSON(), // This expects the inviter.
          subscription,
          invitationRequests: [
            { email: invitation.inviteEmail, role: invitation.initialRole },
          ],
          force: true,
        }
      );

      if (invitationRes.isErr()) {
        return apiError(req, res, invitationRes.error);
      }

      const result = invitationRes.value[0];
      res.status(200).json(result);
      return;
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

export default withSessionAuthenticationForPoke(handler);
