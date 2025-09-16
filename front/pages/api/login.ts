import type { NextApiRequest, NextApiResponse } from "next";

import { getMembershipInvitationToken } from "@app/lib/api/invitation";
import {
  handleEnterpriseSignUpFlow,
  handleMembershipInvite,
  handleRegularSignupFlow,
} from "@app/lib/api/signup";
import { AuthFlowError } from "@app/lib/iam/errors";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { getUserFromSession } from "@app/lib/iam/session";
import { createOrUpdateUser, fetchUserFromSession } from "@app/lib/iam/users";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { getSignInUrl } from "@app/lib/signup";
import { ServerSideTracking } from "@app/lib/tracking/server";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { LightWorkspaceType, WithAPIErrorResponse } from "@app/types";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<void>>,
  { session }: { session: SessionWithUser | null }
): Promise<void> {
  if (!session) {
    res.status(401).end();
    return;
  }

  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const { inviteToken, wId } = req.query;
  const { isSSO, workspaceId } = session;

  // Use the workspaceId from the query if it exists, otherwise use the workspaceId from the workos session.
  const targetWorkspaceId = typeof wId === "string" ? wId : workspaceId;

  let targetWorkspace: LightWorkspaceType | null = null;
  let targetFlow: "joined" | null = null;

  // `membershipInvite` is set to a `MembeshipInvitation` if the query includes an `inviteToken`,
  // meaning the user is going through the invite by email flow.
  const membershipInviteRes =
    await MembershipInvitationResource.getPendingForToken(inviteToken);
  if (membershipInviteRes.isErr()) {
    const { error } = membershipInviteRes;

    if (error instanceof AuthFlowError) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: error.message,
        },
      });
    }

    throw error;
  }

  const membershipInvite = membershipInviteRes.value;

  // Login flow: the first step is to attempt to find the user.
  const nullableUser = await fetchUserFromSession(session);
  const { created: userCreated, user } = await createOrUpdateUser({
    user: nullableUser,
    externalUser: session.user,
  });

  ServerSideTracking.trackSignup({
    user: {
      sId: user.sId,
      id: user.id,
      createdAt: user.createdAt.getTime(),
      username: user.username,
      provider: user.provider,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      image: user.imageUrl,
      fullName: user.name,
      lastLoginAt: user.lastLoginAt?.getTime() ?? null,
    },
  });

  const isInviteOnOtherWorkspace =
    membershipInvite && membershipInvite.workspace.sId !== workspaceId;

  // Prioritize enterprise connections.
  if (workspaceId && isSSO && !isInviteOnOtherWorkspace) {
    const { flow, workspace } = await handleEnterpriseSignUpFlow(
      user,
      workspaceId
    );
    if (flow === "unauthorized") {
      // Only happen if the workspace associated with workOSOrganizationId is not found.
      res.redirect(
        `/api/auth/logout?returnTo=/login-error${encodeURIComponent(`?type=sso-login&reason=${flow}`)}`
      );
      return;
    }

    targetWorkspace = workspace;
    targetFlow = flow;
  } else {
    if (userCreated) {
      // When user is just created, check whether they have a pending invitation. If they do, it is
      // assumed they are coming from the invitation link and have seen the join page; we redirect
      // (after workos login) to this URL with inviteToken appended. The user will then end up on the
      // workspace's welcome page (see comment's PR)
      const pendingInvitation =
        await MembershipInvitationResource.getPendingForEmail(user.email);
      if (pendingInvitation) {
        const signUpUrl = await getSignInUrl({
          signupCallbackUrl: `/api/login?inviteToken=${getMembershipInvitationToken(pendingInvitation.id)}`,
          invitationEmail: pendingInvitation.inviteEmail,
          userExists: true,
        });
        res.redirect(signUpUrl);
        return;
      }
    }

    const loginFctn = membershipInvite
      ? async () => handleMembershipInvite(user, membershipInvite)
      : async () => handleRegularSignupFlow(session, user, targetWorkspaceId);

    const result = await loginFctn();
    if (result.isErr()) {
      const { error } = result;

      if (error instanceof AuthFlowError) {
        logger.error(
          {
            error,
          },
          "Error during login flow."
        );
        res.redirect(
          `/api/auth/logout?returnTo=/login-error${encodeURIComponent(`?type=login&reason=${error.code}`)}`
        );
        return;
      }

      // Delete newly created user if SSO is mandatory.
      if (userCreated) {
        await user.unsafeDelete();
      }

      res.redirect(
        `/api/auth/logout?returnTo=/sso-enforced?workspaceId=${error.workspaceId}`
      );
      return;
    }

    const { flow, workspace } = result.value;
    if (flow === "no-auto-join" || flow === "revoked") {
      res.redirect(`/no-workspace?flow=${flow}`);
      return;
    }

    targetWorkspace = workspace;
    targetFlow = flow;
  }

  const u = await getUserFromSession(session);
  if (!u || u.workspaces.length === 0) {
    res.redirect("/no-workspace?flow=revoked");
    return;
  }

  await user.recordLoginActivity();

  if (targetWorkspace && targetFlow === "joined") {
    // For users joining a workspace from trying to access a conversation, we redirect to this
    // conversation after signing in.
    if (req.query.join === "true" && req.query.cId) {
      res.redirect(`/w/${targetWorkspace.sId}/welcome?cId=${req.query.cId}`);
      return;
    }
    res.redirect(`/w/${targetWorkspace.sId}/welcome`);
    return;
  }

  res.redirect(
    `/w/${targetWorkspace ? targetWorkspace.sId : u.workspaces[0].sId}`
  );

  return;
}

// Note from seb: Should it be withSessionAuthentication?
export default withLogging(handler);
