import {
  buildAuditLogTarget,
  emitAuditLogEventDirect,
} from "@app/lib/api/audit/workos_audit";
import config from "@app/lib/api/config";
import { makeEnterpriseConnectionInitiateLoginUrl } from "@app/lib/api/enterprise_connection";
import { config as multiRegionsConfig } from "@app/lib/api/regions/config";
import { lookupWorkspace } from "@app/lib/api/regions/lookup";
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
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { readAnonymousIdFromCookies } from "@app/lib/utils/anonymous_id";
import type { UTMParams } from "@app/lib/utils/utm";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { LightWorkspaceType } from "@app/types/user";
import type { NextApiRequest, NextApiResponse } from "next";

export interface PerformLoginOptions {
  inviteToken: string | null;
  wId: string | null;
  utmParams: UTMParams;
  join: boolean;
  conversationId: string | null;
  // If set (and safe), user is redirected here after successful login instead
  // of the default /w/<workspaceId> destination. Callers must validate and
  // sanitize the path before passing it in.
  returnTo: string | null;
}

export async function performLogin(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<void>>,
  session: SessionWithUser,
  options: PerformLoginOptions
): Promise<void> {
  const { inviteToken, wId, utmParams, join, conversationId, returnTo } =
    options;
  const { isSSO, workspaceId } = session;

  const anonymousId =
    readAnonymousIdFromCookies(req.headers.cookie) ?? undefined;

  // Use the workspaceId from the query if it exists, otherwise use the workspaceId from the workos session.
  const targetWorkspaceId = wId ?? workspaceId;

  let targetWorkspace: LightWorkspaceType | null = null;
  let targetFlow: "joined" | null = null;
  let activeMemberships: MembershipResource[] = [];

  // `membershipInvite` is set to a `MembeshipInvitation` if the caller provided an `inviteToken`,
  // meaning the user is going through the invite by email flow.
  const membershipInviteRes =
    await MembershipInvitationResource.getPendingForToken(
      inviteToken ?? undefined
    );
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
  if (nullableUser) {
    // Should never happen - if we have stale data in the cache, send a panic log.
    const fetchedUser = await UserResource.fetchById(nullableUser.sId);
    if (!fetchedUser) {
      logger.error(
        {
          workOSUserId: nullableUser.workOSUserId,
          panic: true,
        },
        "User not found in database, but found in cache. Flush redis cache for this workOSUserId."
      );
      res.status(401).end();
      return;
    }
  }

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
    utmParams,
    anonymousId,
    userCreated,
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
      // Workspace not found on this region: redirect to the other region's /api/login (cookie is shared).
      const workspaceRegionRes = await lookupWorkspace(workspaceId);
      const currentRegion = multiRegionsConfig.getCurrentRegion();
      if (
        workspaceRegionRes.isOk() &&
        workspaceRegionRes.value &&
        workspaceRegionRes.value !== currentRegion
      ) {
        logger.info(
          {
            userId: user.sId,
            workspaceId,
            targetRegion: workspaceRegionRes.value,
            sessionIsSSO: session.isSSO,
            sessionWorkspaceId: session.workspaceId,
            sessionOrganizationId: session.organizationId,
            sessionAuthenticationMethod: session.authenticationMethod,
            sessionRegion: session.region,
          },
          "Enterprise connection: redirecting to other region"
        );
        const targetUrl = multiRegionsConfig.getRegionUrl(
          workspaceRegionRes.value
        );
        res.redirect(`${targetUrl}/api/login`);
        return;
      }

      logger.error(
        { userId: user.sId, workspaceId },
        "Enterprise connection : workspace not found"
      );

      // Workspace not in other region or lookup failed: show login error.
      res.redirect(
        `/api/workos/logout?returnTo=/login-error${encodeURIComponent(`?type=sso-login&reason=${flow}`)}`
      );
      return;
    }

    targetWorkspace = workspace;
    targetFlow = flow;

    // Fetch memberships for first use marking.
    const { memberships } = await MembershipResource.getActiveMemberships({
      users: [user],
    });
    activeMemberships = memberships;
  } else {
    const { memberships } = await MembershipResource.getActiveMemberships({
      users: [user],
    });
    activeMemberships = memberships;

    // When user has no memberships, and no invitation is already provided, check if there is a
    // pending invitation.
    const pendingInvitations =
      activeMemberships.length === 0 && !membershipInvite
        ? await MembershipInvitationResource.listPendingForEmail({
            email: user.email,
          })
        : null;

    // More than one pending invitation, redirect to invite choose page - otherwise use the first one.
    if (pendingInvitations && pendingInvitations.length > 1) {
      res.redirect(`${config.getAppUrl()}/invite-choose`);
      return;
    }

    const finalMembershipInvite = membershipInvite ?? pendingInvitations?.[0];
    const loginFctn = finalMembershipInvite
      ? async () =>
          handleMembershipInvite({
            user,
            membershipInvite: finalMembershipInvite,
          })
      : async () =>
          handleRegularSignupFlow(
            session,
            user,
            activeMemberships,
            targetWorkspaceId,
            utmParams
          );

    const result = await loginFctn();
    if (result.isErr()) {
      const { error } = result;

      if (error instanceof AuthFlowError) {
        logger.error(
          {
            userId: user.sId,
            workspaceId: targetWorkspaceId,
            error,
          },
          "Error during login flow."
        );
        res.redirect(
          `/api/workos/logout?returnTo=/login-error${encodeURIComponent(`?type=login&reason=${error.code}`)}`
        );
        return;
      }

      // Delete newly created user if SSO is mandatory.
      if (userCreated) {
        await user.unsafeDelete();
      }

      const ssoLoginUrl = await makeEnterpriseConnectionInitiateLoginUrl(
        error.workspaceId,
        null
      );

      logger.error(
        {
          userId: user.sId,
          workspaceId: targetWorkspaceId,
          error,
        },
        "SSO enforcement : redirecting to SSO login."
      );

      res.redirect(
        `/api/workos/logout?returnTo=${encodeURIComponent(ssoLoginUrl)}`
      );
      return;
    }

    const { flow, workspace } = result.value;
    if (flow === "no-auto-join" || flow === "revoked") {
      res.redirect(`${config.getAppUrl()}/no-workspace?flow=${flow}`);
      return;
    }

    targetWorkspace = workspace;
    targetFlow = flow;
  }

  const u = await getUserFromSession(session);
  if (!u || u.workspaces.length === 0) {
    res.redirect(`${config.getAppUrl()}/no-workspace?flow=revoked`);
    return;
  }

  const redirectOptions: Parameters<typeof buildPostLoginUrl>[1] = {
    welcome: user.lastLoginAt === null,
    utmParams: Object.keys(utmParams).length > 0 ? utmParams : undefined,
  };

  await user.recordLoginActivity();

  if (targetWorkspace) {
    const forwarded = req.headers["x-forwarded-for"];
    const ip = forwarded
      ? (Array.isArray(forwarded) ? forwarded[0] : forwarded)
          .split(",")[0]
          .trim()
      : req.socket?.remoteAddress;
    void emitAuditLogEventDirect({
      workspace: targetWorkspace,
      action: "user.login",
      actor: {
        type: "user",
        id: user.sId,
        name: user.name,
      },
      targets: [
        buildAuditLogTarget("user", { sId: user.sId, name: user.name }),
      ],
      context: { location: ip ?? "internal" },
      metadata: {
        isSSO: String(session.isSSO),
        authenticationMethod: session.authenticationMethod ?? "unknown",
      },
    });
  }

  // Mark first use for provisioned membership when user accesses a workspace.
  if (targetWorkspace) {
    const targetMembership = activeMemberships.find(
      (m) => m.workspaceId === targetWorkspace.id
    );
    if (targetMembership) {
      await targetMembership.markFirstUse();
    }
  }

  if (targetWorkspace && targetFlow === "joined") {
    // For users joining a workspace from trying to access a conversation, we redirect to this
    // conversation after signing in.
    if (join && conversationId) {
      redirectOptions.conversationId = conversationId;
    }
    res.redirect(buildPostLoginUrl(targetWorkspace.sId, redirectOptions));
    return;
  }

  // If caller provided a safe deep-link returnTo, honor it over the default
  // workspace destination. This is used by the WorkOS callback to restore the
  // URL the user was originally trying to reach.
  if (returnTo) {
    res.redirect(returnTo);
    return;
  }

  res.redirect(
    buildPostLoginUrl(
      targetWorkspace?.sId ?? u.workspaces[0].sId,
      redirectOptions
    )
  );
}

const buildPostLoginUrl = (
  workspaceId: string,
  options?: {
    welcome?: boolean;
    conversationId?: string;
    utmParams?: UTMParams;
  }
) => {
  let path = `${config.getAppUrl()}/w/${workspaceId}`;
  if (options?.welcome) {
    path += "/welcome";
  }

  const searchParams = new URLSearchParams();
  if (options?.conversationId) {
    searchParams.set("cId", options.conversationId);
  }
  if (options?.utmParams) {
    for (const [key, value] of Object.entries(options.utmParams)) {
      searchParams.set(key, value);
    }
  }

  const currentRegion = multiRegionsConfig.getCurrentRegion();
  searchParams.set("region", currentRegion);
  searchParams.set("regionUrl", multiRegionsConfig.getRegionUrl(currentRegion));

  const queryString = searchParams.toString();
  return queryString ? `${path}?${queryString}` : path;
};
