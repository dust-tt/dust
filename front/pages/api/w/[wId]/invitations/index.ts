import sgMail from "@sendgrid/mail";
import { sign } from "jsonwebtoken";
import { NextApiRequest, NextApiResponse } from "next";

import { getInvitations } from "@app/lib/api/workspace";
import { Authenticator, getSession } from "@app/lib/auth";
import { MembershipInvitation } from "@app/lib/models";
import { isEmailValid } from "@app/lib/utils";
import { apiError, withLogging } from "@app/logger/withlogging";
import { MembershipInvitationType } from "@app/types/membership_invitation";

const { SENDGRID_API_KEY, NEXTAUTH_URL, WORKSPACE_INVITE_TOKEN_SECRET } = process.env;
sgMail.setApiKey(SENDGRID_API_KEY!);


export type GetWorkspaceInvitationsResponseBody = {
  invitations: MembershipInvitationType[];
};


async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetWorkspaceInvitationsResponseBody>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner || owner.type !== "team") {
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

  switch (req.method) {
    case "GET":
      let invitations = await getInvitations(auth);
      res.status(200).json({ invitations });
      return;

    case "POST":
      if (
          !req.body ||
          !typeof (req.body.inviteEmail === "string") ||
          !isEmailValid(req.body.inviteEmail)
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The request body is invalid, expects { email: string }.",
          },
        });
      }
      // Create MembershipInvitation
      const inviteEmail = req.body.inviteEmail
      const invitationToken = sign({ workspaceId: owner.id, inviteEmail }, WORKSPACE_INVITE_TOKEN_SECRET!);
      let invitation = await MembershipInvitation.create({
        workspaceId: owner.id,
        inviteEmail,
        status: "pending",
        token: invitationToken,
      });
      await invitation.save();

      // Send invite email
      const message = {
        to: invitation.inviteEmail,
        from: 'team@dust.tt',
        subject: 'You have been invited to join a Dust workspace',
        text: `You have been invited to join a Dust workspace. Click the link below to accept the invitation: ${NEXTAUTH_URL}/login?token=${invitationToken}`,
      }
      await sgMail.send(message);
      res.status(200).json({
        invitations: [{
          id: invitation.id,
          status: invitation.status,
          inviteEmail: invitation.inviteEmail,
        }],
      });
      return

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

export default withLogging(handler);
