import { verify } from "jsonwebtoken";
import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { getUserMetadata } from "@app/lib/api/user";
import { upgradeWorkspace } from "@app/lib/api/workspace";
import { getUserFromSession } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import {
  Membership,
  MembershipInvitation,
  User,
  Workspace,
} from "@app/lib/models";
import { new_id } from "@app/lib/utils";
import { apiError, withLogging } from "@app/logger/withlogging";

import { authOptions } from "./auth/[...nextauth]";

const { DUST_INVITE_TOKEN_SECRET = "" } = process.env;

// List of emails for which all worksapces should be upgraded
// at sign-up time.
const EMAILS_TO_AUTO_UPGRADE = ["oauthtest121@gmail.com"];

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
      // `workspaceInvite` is set to a `Workspace` if the query includes a `wId`. It means the user
      // is going through the flow of whitelisted domain to join the workspace.
      let workspaceInvite: null | Workspace = null;

      if (req.query.wId) {
        workspaceInvite = await Workspace.findOne({
          where: {
            sId: req.query.wId as string,
          },
        });

        if (workspaceInvite) {
          const allowedDomain = workspaceInvite.allowedDomain;
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
      }

      // `membershipInvite` is set to a `MembeshipInvitation` if the query includes an
      // `inviteToken`, meaning the user is going through the invite by email flow.
      let membershipInvite: MembershipInvitation | null = null;

      if (req.query.inviteToken) {
        const inviteToken = req.query.inviteToken as string;
        const decodedToken = verify(inviteToken, DUST_INVITE_TOKEN_SECRET) as {
          membershipInvitationId: number;
        };

        membershipInvite = await MembershipInvitation.findOne({
          where: {
            id: decodedToken.membershipInvitationId,
          },
        });
        if (!membershipInvite) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "The invite token is invalid, please ask your admin to resend an invitation.",
            },
          });
        }
        if (membershipInvite.status !== "pending") {
          membershipInvite = null;
        }
      }

      // Login flow: first step is to attempt to find the user.
      let user = await User.findOne({
        where: {
          provider: session.provider.provider,
          providerId: session.provider.id.toString(),
        },
      });

      // The user already exists, we create memberships as needed given the values of
      // `workspaceInvite` and `membershipInvite`.
      if (user) {
        // Update the user object from the updated session information.
        user.username = session.user.username;
        user.email = session.user.email;
        user.name = session.user.name;
        await user.save();
      }

      // The user does not exist. We create it and create a personal workspace if there is no invite
      // associated with the login request.
      if (!user) {
        const uId = new_id();

        user = await User.create({
          provider: session.provider.provider,
          providerId: session.provider.id.toString(),
          username: session.user.username,
          email: session.user.email,
          name: session.user.name,
        });

        // If there is no invte, we create a personal workspace for the user, otherwise the user
        // will be added to the workspace they were invited to (either by email or by domain) below.
        if (!workspaceInvite && !membershipInvite) {
          const w = await Workspace.create({
            uId,
            sId: uId.slice(0, 10),
            name: session.user.username,
          });

          await Membership.create({
            role: "admin",
            userId: user.id,
            workspaceId: w.id,
          });

          if (EMAILS_TO_AUTO_UPGRADE.includes(user.email)) {
            await upgradeWorkspace(w.id);
          }
        }
      }

      let targetWorkspace: Workspace | null = null;

      // `workspaceInvite` flow: we know we can add the user to the workspace as all the checks
      // have been run. Simply create the membership if does not alreayd exist.
      if (workspaceInvite) {
        let m = await Membership.findOne({
          where: {
            userId: user.id,
            workspaceId: workspaceInvite.id,
          },
        });

        if (!m) {
          m = await Membership.create({
            role: "user",
            userId: user.id,
            workspaceId: workspaceInvite.id,
          });
        }

        if (m.role === "revoked") {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "Your access to the workspace has been revoked, please contact the workspace admin to update your role.",
            },
          });
        }

        targetWorkspace = workspaceInvite;
      }

      // `membershipInvite` flow: we know we can add the user to the associated `workspaceId` as
      // all the checkcs (decoding the JWT) have been run before. Simply create the membership if
      // it does not already exist and mark the invitation as consumed.
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
        membershipInvite.status = "consumed";
        membershipInvite.invitedUserId = user.id;
        await membershipInvite.save();

        if (m.role === "revoked") {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "Your access to the workspace has been revoked, please contact the workspace admin to update your role.",
            },
          });
        }

        targetWorkspace = await Workspace.findOne({
          where: {
            id: membershipInvite.workspaceId,
          },
        });
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

      if (targetWorkspace) {
        res.redirect(`/w/${targetWorkspace.sId}`);
        return;
      }

      const m = await getUserMetadata(u, "sticky_path");
      if (m) {
        console.log("LOGIN STICKY PATH", m.value);
        res.redirect(m.value);
      } else {
        console.log("LOGIN STICKY PATH NOT FOUND");
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
