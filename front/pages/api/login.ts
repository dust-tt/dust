import { verify } from "jsonwebtoken";
import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { getUserFromSession } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import {Membership, MembershipInvitation, User, Workspace} from "@app/lib/models";
import { new_id } from "@app/lib/utils";
import { apiError, withLogging } from "@app/logger/withlogging";

import { authOptions } from "./auth/[...nextauth]";

const { WORKSPACE_INVITE_TOKEN_SECRET } = process.env;


async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ReturnedAPIErrorType>
): Promise<void> {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    res.status(401).end();
    return;
  }

  switch (req.method) {
    case "GET":
      let invite: null | Workspace = null;
      let membershipInvite: MembershipInvitation | null = null;
      if (req.query.wId) {
        invite = await Workspace.findOne({
          where: {
            sId: req.query.wId as string,
          },
        });
      }

      if (req.query.inviteToken) {
        const inviteToken = req.query.inviteToken as string;
        const decodedToken = verify(inviteToken, WORKSPACE_INVITE_TOKEN_SECRET!) as { workspaceId: string, inviteEmail: string};
        membershipInvite = await MembershipInvitation.findOne({
            where: {
              workspaceId: decodedToken.workspaceId,
              inviteEmail: decodedToken.inviteEmail,
            }
        });
        if (!membershipInvite) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "The invite token is invalid.",
            },
          });
        }
      }

      if (invite) {
        const allowedDomain = invite.allowedDomain;
        if (!allowedDomain) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "The workspace you are trying to join does not allow your domain name, contact us at team@dust.tt for assistance.",
            },
          });
        }

        if (
          session.provider.provider !== "google" ||
          !session.user.email_verified
        ) {
          return apiError(req, res, {
            status_code: 401,
            api_error: {
              type: "workspace_auth_error",
              message:
                "You can only join a workspace using Google sign-in with a verified email, contact us at team@dust.tt for assistance.",
            },
          });
        }

        if (allowedDomain !== session.user.email.split("@")[1]) {
          return apiError(req, res, {
            status_code: 401,
            api_error: {
              type: "workspace_auth_error",
              message: `You are not authorized to join this workspace (your domain: ${
                session.user.email.split("@")[1]
              }), contact us at team@dust.tt for assistance.`,
            },
          });
        }
      }

      const user = await User.findOne({
        where: {
          provider: session.provider.provider,
          providerId: session.provider.id.toString(),
        },
      });

      if (user) {
        user.username = session.user.username;
        user.email = session.user.email;
        user.name = session.user.name;
        await user.save();

        if (invite) {
          let m = await Membership.findOne({
            where: {
              userId: user.id,
              workspaceId: invite.id,
            },
          });

          if (!m) {
            m = await Membership.create({
              role: "user",
              userId: user.id,
              workspaceId: invite.id,
            });
          }
        }
        if (membershipInvite) {
          let m = await Membership.findOne({
            where: {
              userId: user.id,
              workspaceId: membershipInvite.workspaceId,
            },
          });

          if (!m) {
            m = await Membership.create({
              role: "user",
              userId: user.id,
              workspaceId: membershipInvite.workspaceId,
            });
          }
          membershipInvite.status = "consumed"
          membershipInvite.invitedUserId = user.id
          await membershipInvite.save()
        }
      }
      if (!user) {
        const uId = new_id();

        const user = await User.create({
          provider: session.provider.provider,
          providerId: session.provider.id.toString(),
          username: session.user.username,
          email: session.user.email,
          name: session.user.name,
        });

        if (invite) {
          await Membership.create({
            role: "user",
            userId: user.id,
            workspaceId: invite.id,
          });
        } else if (membershipInvite) {
          const m = await Membership.create({
            role: "user",
            userId: user.id,
            workspaceId: membershipInvite.id,
          });
          membershipInvite.status = "consumed"
          membershipInvite.invitedUserId = user.id
          await membershipInvite.save()
        } else {
          const w = await Workspace.create({
            uId,
            sId: uId.slice(0, 10),
            name: session.user.username,
            type: "personal",
          });

          await Membership.create({
            role: "admin",
            userId: user.id,
            workspaceId: w.id,
          });
        }
      }

      const u = await getUserFromSession(session);

      if (!u || u.workspaces.length === 0) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message:
              "Could not find user or workspace for user, contact us at team@dust.tt for assistance.",
          },
        });
      }

      if (invite) {
        res.redirect(`/w/${invite.sId}`);
      } else {
        // TODO(spolu): persist latest workspace in session?
        res.redirect(`/w/${u.workspaces[0].sId}`);
      }
      return;

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
