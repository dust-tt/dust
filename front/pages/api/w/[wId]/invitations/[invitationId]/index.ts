import type { MembershipInvitationType } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { MembershipInvitation } from "@app/lib/models";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetMemberInvitationsResponseBody = {
  invitations: MembershipInvitationType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetMemberInvitationsResponseBody>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can see membership invitations or modify it.",
      },
    });
  }

  const invitationId = parseInt(req.query.invitationId as string);
  if (isNaN(invitationId)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "invitation_not_found",
        message: "The invitation requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      if (
        !req.body ||
        !typeof (req.body.status === "string") ||
        // For now we only allow revoking invitations.
        req.body.status !== "revoked"
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              'The request body is invalid, expects { status: "revoked" }.',
          },
        });
      }

      const invitation = await MembershipInvitation.findOne({
        where: { id: invitationId },
      });

      if (!invitation) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "invitation_not_found",
            message: "The invitation requested was not found.",
          },
        });
      }

      invitation.status = req.body.status;
      await invitation.save();
      res.status(200).json({
        invitations: [
          {
            id: invitation.id,
            status: invitation.status,
            inviteEmail: invitation.inviteEmail,
          },
        ],
      });
      return;

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

export default withLogging(handler);
