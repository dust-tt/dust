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
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import type { LightWorkspaceType } from "@app/types/user";

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

/**
 * Transport-agnostic input for `performLogin`. Carries only the request
 * fields the login flow actually reads, so both the Next handler and the
 * Hono handler can call into it.
 */
export interface PerformLoginRequest {
  cookieHeader: string | undefined;
  forwardedFor: string | string[] | undefined;
  remoteAddress: string | undefined;
}

/**
 * Result of `performLogin`. The handler at the transport boundary
 * (Next API route or Hono route) maps this to the actual HTTP response.
 */
export type LoginOutcome =
  | { kind: "redirect"; url: string }
  | { kind: "unauthorized" }
  | { kind: "apiError"; error: APIErrorWithContentfulStatusCode };

function resolveClientIp(request: PerformLoginRequest): string | undefined {
  const { forwardedFor, remoteAddress } = request;
  if (forwardedFor) {
    return (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)
      .split(",")[0]
      .trim();
  }
  return remoteAddress;
}

export async function performLogin(
  request: PerformLoginRequest,
  session: SessionWithUser,
  options: PerformLoginOptions
): Promise<LoginOutcome> {
  const { inviteToken, wId, utmParams, join, conversationId, returnTo } =
    options;
  const { isSSO, workspaceId } = session;

  const anonymousId =
    readAnonymousIdFromCookies(request.cookieHeader) ?? undefined;

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
      return {
        kind: "apiError",
        error: {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: error.message,
          },
        },
      };
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
      return { kind: "unauthorized" };
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
        return { kind: "redirect", url: `${targetUrl}/api/login` };
      }

      logger.error(
        { userId: user.sId, workspaceId },
        "Enterprise connection : workspace not found"
      );

      // Workspace not in other region or lookup failed: show login error.
      return {
        kind: "redirect",
        url: `/api/workos/logout?returnTo=/login-error${encodeURIComponent(`?type=sso-login&reason=${flow}`)}`,
      };
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
      return {
        kind: "redirect",
        url: `${config.getAppUrl()}/invite-choose`,
      };
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
        return {
          kind: "redirect",
          url: `/api/workos/logout?returnTo=/login-error${encodeURIComponent(`?type=login&reason=${error.code}`)}`,
        };
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

      return {
        kind: "redirect",
        url: `/api/workos/logout?returnTo=${encodeURIComponent(ssoLoginUrl)}`,
      };
    }

    const { flow, workspace } = result.value;
    if (flow === "no-auto-join" || flow === "revoked") {
      return {
        kind: "redirect",
        url: `${config.getAppUrl()}/no-workspace?flow=${flow}`,
      };
    }

    targetWorkspace = workspace;
    targetFlow = flow;
  }

  const u = await getUserFromSession(session);
  if (!u || u.workspaces.length === 0) {
    return {
      kind: "redirect",
      url: `${config.getAppUrl()}/no-workspace?flow=revoked`,
    };
  }

  const redirectOptions: Parameters<typeof buildPostLoginUrl>[1] = {
    welcome: user.lastLoginAt === null,
    utmParams: Object.keys(utmParams).length > 0 ? utmParams : undefined,
  };

  await user.recordLoginActivity();

  if (targetWorkspace) {
    const ip = resolveClientIp(request);
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
        is_sso: String(session.isSSO),
        authentication_method: session.authenticationMethod ?? "unknown",
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
    return {
      kind: "redirect",
      url: buildPostLoginUrl(targetWorkspace.sId, redirectOptions),
    };
  }

  // If caller provided a safe deep-link returnTo, honor it over the default
  // workspace destination. This is used by the WorkOS callback to restore the
  // URL the user was originally trying to reach.
  if (returnTo) {
    return { kind: "redirect", url: returnTo };
  }

  return {
    kind: "redirect",
    url: buildPostLoginUrl(
      targetWorkspace?.sId ?? u.workspaces[0].sId,
      redirectOptions
    ),
  };
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

  const queryString = searchParams.toString();
  return queryString ? `${path}?${queryString}` : path;
};
