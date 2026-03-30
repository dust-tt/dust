/**
 * @swagger
 * /api/workos/login:
 *   get:
 *     summary: Initiate WorkOS login
 *     description: Redirects to WorkOS AuthKit for authentication. Supports PKCE flow for extensions.
 *     tags:
 *       - Private Authentication
 *     security: []
 *     parameters:
 *       - in: query
 *         name: redirect_uri
 *         required: false
 *         description: Custom redirect URI (used by extensions for PKCE flow)
 *         schema:
 *           type: string
 *       - in: query
 *         name: code_challenge
 *         required: false
 *         description: PKCE code challenge
 *         schema:
 *           type: string
 *       - in: query
 *         name: code_challenge_method
 *         required: false
 *         description: PKCE code challenge method (S256)
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Login page HTML
 *       302:
 *         description: Redirect to WorkOS authorization URL
 *       400:
 *         description: Bad request
 * /api/workos/authenticate:
 *   post:
 *     summary: Exchange code or refresh token
 *     description: Exchanges an authorization code or refresh token for access tokens via WorkOS.
 *     tags:
 *       - Private Authentication
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code:
 *                 type: string
 *               grant_type:
 *                 type: string
 *                 enum: [refresh_token]
 *               refresh_token:
 *                 type: string
 *               code_verifier:
 *                 type: string
 *     responses:
 *       200:
 *         description: Authentication result with tokens
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *                 user:
 *                   type: object
 *                 expiresIn:
 *                   type: integer
 *                   description: Token expiry in seconds
 *                 expirationDate:
 *                   type: integer
 *                   description: Token expiry date in milliseconds
 *       400:
 *         description: Invalid request
 * /api/workos/revoke-session:
 *   post:
 *     summary: Revoke a session
 *     description: Revokes a WorkOS session by session ID. Used by the Chrome extension for logout.
 *     tags:
 *       - Private Authentication
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - session_id
 *             properties:
 *               session_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Session revoked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: Invalid session_id
 */
import {
  buildWorkspaceTarget,
  emitAuditLogEvent,
  emitAuditLogEventDirect,
} from "@app/lib/api/audit/workos_audit";
import config from "@app/lib/api/config";
import type { RegionType } from "@app/lib/api/regions/config";
import {
  config as multiRegionsConfig,
  SUPPORTED_REGIONS,
} from "@app/lib/api/regions/config";
import { checkUserRegionAffinity } from "@app/lib/api/regions/lookup";
import { getWorkOS } from "@app/lib/api/workos/client";
import { isOrganizationSelectionRequiredError } from "@app/lib/api/workos/types";
import type { SessionCookie } from "@app/lib/api/workos/user";
import { Authenticator, getSession } from "@app/lib/auth";
import { DUST_HAS_SESSION } from "@app/lib/cookies";
import { fetchUserFromSession } from "@app/lib/iam/users";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { getClientIp } from "@app/lib/utils/request";
import { getStatsDClient } from "@app/lib/utils/statsd";
import { extractUTMParams } from "@app/lib/utils/utm";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";

import { isDevelopment } from "@app/types/shared/env";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import { validateRelativePath } from "@app/types/shared/utils/url_utils";
import { GenericServerException, OauthException } from "@workos-inc/node";
import { sealData } from "iron-session";
import type { NextApiRequest, NextApiResponse } from "next";

function isValidScreenHint(
  screenHint: string | string[] | undefined
): screenHint is "sign-up" | "sign-in" {
  return isString(screenHint) && ["sign-up", "sign-in"].includes(screenHint);
}

//TODO(workos): This file could be split in 3 route handlers.
// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { action } = req.query;

  switch (action) {
    case "login":
      return handleLogin(req, res);
    case "callback":
      return handleCallback(req, res);
    case "authenticate":
      return handleAuthenticate(req, res);
    case "logout":
      return handleLogout(req, res);
    case "revoke-session":
      return handleRevokeSession(req, res);
    default:
      return res.status(400).json({ error: "Invalid action" });
  }
}

async function handleLogin(req: NextApiRequest, res: NextApiResponse) {
  try {
    const {
      organizationId,
      screenHint,
      loginHint,
      returnTo,
      redirect_uri,
      code_challenge,
      code_challenge_method,
    } = req.query;

    const redirectUri =
      redirect_uri && isString(redirect_uri)
        ? redirect_uri
        : `${config.getAuthRedirectBaseUrl()}/api/workos/callback`;

    let organizationIdToUse;

    if (organizationId && typeof organizationId === "string") {
      organizationIdToUse = organizationId;
    }

    const enterpriseParams: { organizationId?: string; connectionId?: string } =
      {};
    if (organizationIdToUse) {
      enterpriseParams.organizationId = organizationIdToUse;

      // TODO(workos): We will want to cache this data
      const connections = await getWorkOS().sso.listConnections({
        organizationId: organizationIdToUse,
      });

      /**
       * We only want to check active enterprise connection.
       */
      const connection =
        connections.data.length > 0
          ? connections.data.find((c) => c.state === "active")
          : undefined;

      if (connection) {
        enterpriseParams.connectionId = connection.id;
      }
    }

    // Validate and sanitize returnTo to ensure it's a relative path
    const validatedReturnTo = validateRelativePath(returnTo);
    const sanitizedReturnTo = validatedReturnTo.valid
      ? validatedReturnTo.sanitizedPath
      : null;
    // Extract UTM params from query to preserve through OAuth flow
    const utmParams = extractUTMParams(req.query);
    const state = {
      ...(sanitizedReturnTo ? { returnTo: sanitizedReturnTo } : {}),
      ...(organizationIdToUse ? { organizationId: organizationIdToUse } : {}),
      ...(Object.keys(utmParams).length > 0 ? { utm: utmParams } : {}),
    };

    const authorizationUrl = getWorkOS().userManagement.getAuthorizationUrl({
      // Specify that we'd like AuthKit to handle the authentication flow
      provider: "authkit",
      // Use auth redirect base URL for WorkOS callbacks
      redirectUri,
      clientId: config.getWorkOSClientId(),
      ...enterpriseParams,
      state:
        Object.keys(state).length > 0
          ? Buffer.from(JSON.stringify(state)).toString("base64")
          : undefined,
      ...(isValidScreenHint(screenHint) ? { screenHint } : {}),
      ...(isString(loginHint) ? { loginHint } : {}),
      ...(isString(code_challenge) ? { codeChallenge: code_challenge } : {}),
      ...(isString(code_challenge_method) && code_challenge_method === "S256"
        ? { codeChallengeMethod: code_challenge_method }
        : {}),
    });

    res.redirect(authorizationUrl);
  } catch (error) {
    logger.error({ error }, "Error during WorkOS login");
    getStatsDClient().increment("login.error", 1);
    res.redirect("/login-error?type=workos-login");
  }
}

async function handleAuthenticate(req: NextApiRequest, res: NextApiResponse) {
  const { code, grant_type, refresh_token, code_verifier } = req.body;

  if (grant_type && !isString(grant_type)) {
    return res
      .status(400)
      .json({ error: "Invalid grant_type", type: "invalid_request_error" });
  }

  if (grant_type === "refresh_token") {
    if (!refresh_token || !isString(refresh_token)) {
      return res.status(400).json({
        error: "Invalid refresh token",
        type: "invalid_request_error",
      });
    }
    try {
      const result =
        await getWorkOS().userManagement.authenticateWithRefreshToken({
          refreshToken: refresh_token,
          clientId: config.getWorkOSClientId(),
        });

      const jwtPayload = JSON.parse(
        Buffer.from(result.accessToken.split(".")[1], "base64").toString()
      );

      return res.status(200).json({
        ...result,
        expirationDate: jwtPayload.exp * 1000,
      });
    } catch (error) {
      if (error instanceof OauthException) {
        return res
          .status(error.status)
          .json({ error: error.errorDescription, type: error.error });
      } else {
        logger.error({ error }, "Error during WorkOS token refresh");
        return res.status(500).json({
          error: "Authentication failed",
          type: "internal_server_error",
        });
      }
    }
  }

  if (!code || !isString(code)) {
    return res.status(400).json({ error: "Invalid code" });
  }

  if (code_verifier && !isString(code_verifier)) {
    return res.status(400).json({ error: "Invalid code verifier" });
  }
  try {
    const authResult = await authenticate({
      code,
      codeVerifier: code_verifier,
    });

    const jwtPayload = JSON.parse(
      Buffer.from(authResult.accessToken.split(".")[1], "base64").toString()
    );
    const expiresIn = jwtPayload.exp
      ? jwtPayload.exp - Math.floor(Date.now() / 1000)
      : undefined;

    return res.status(200).json({
      ...authResult,
      expiresIn,
      expirationDate: jwtPayload.exp * 1000,
    });
  } catch (error) {
    if (error instanceof OauthException) {
      return res
        .status(error.status)
        .json({ error: error.errorDescription, type: error.error });
    } else {
      logger.error({ error }, "Error during WorkOS authentication");
      return res.status(500).json({
        error: "Authentication failed",
        type: "internal_server_error",
      });
    }
  }
}

async function authenticate({
  code,
  codeVerifier,
  organizationId,
}: {
  code: string;
  codeVerifier?: string;
  organizationId?: string;
}) {
  try {
    return await getWorkOS().userManagement.authenticateWithCode({
      code,
      codeVerifier,
      clientId: config.getWorkOSClientId(),
      session: {
        sealSession: true,
        cookiePassword: config.getWorkOSCookiePassword(),
      },
    });
  } catch (error) {
    if (error instanceof GenericServerException) {
      const errorData = error.rawData;
      // In case we're coming from a login with organizationId, we need to complete the authentication with organization selection
      if (organizationId && isOrganizationSelectionRequiredError(errorData)) {
        const result =
          await getWorkOS().userManagement.authenticateWithOrganizationSelection(
            {
              clientId: config.getWorkOSClientId(),
              pendingAuthenticationToken:
                errorData.pending_authentication_token,
              organizationId,
              session: {
                sealSession: true,
                cookiePassword: config.getWorkOSCookiePassword(),
              },
            }
          );

        return result;
      }
    }

    throw error; // Re-throw other errors
  }
}

async function handleCallback(req: NextApiRequest, res: NextApiResponse) {
  const { code, state } = req.query;
  if (!code || typeof code !== "string") {
    return redirectTo(
      res,
      "/login-error?reason=invalid-code&type=workos-callback"
    );
  }

  const stateObj = isString(state)
    ? JSON.parse(Buffer.from(state, "base64").toString("utf-8"))
    : {};

  let callbackWorkspaceId: string | undefined;

  try {
    const {
      user,
      organizationId,
      authenticationMethod,
      sealedSession,
      accessToken,
    } = await authenticate({ code, organizationId: stateObj.organizationId });

    if (!sealedSession) {
      throw new Error("Sealed session not found");
    }

    // Decode and inspect JWT content
    const decodedPayload = JSON.parse(
      Buffer.from(accessToken.split(".")[1], "base64").toString()
    );

    const sessionCookie: SessionCookie = {
      sessionData: sealedSession,
      organizationId,
      authenticationMethod,
      region:
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        decodedPayload["https://dust.tt/region"] ||
        multiRegionsConfig.getCurrentRegion(),
      workspaceId: decodedPayload["https://dust.tt/workspaceId"],
    };

    callbackWorkspaceId = sessionCookie.workspaceId;

    const sealedCookie = await sealData(sessionCookie, {
      password: config.getWorkOSCookiePassword(),
      ttl: 0,
    });

    // Record login activity at authentication time (covers SCIM/provisioned users
    // who may bypass /api/login via returnTo redirects).
    try {
      const dustUser = await UserResource.fetchByWorkOSUserId(user.id);
      if (dustUser) {
        await dustUser.recordLoginActivity();
      }
    } catch (loginTrackingError) {
      logger.error(
        { error: loginTrackingError, workOSUserId: user.id },
        "Failed to record login activity at authentication"
      );
    }

    const currentRegion = multiRegionsConfig.getCurrentRegion();
    let targetRegion: RegionType | null = "us-central1";

    // If user has a region, redirect to the region page.
    const userSessionRegion = sessionCookie.region;

    // Validate returnTo from state to ensure it's a relative path
    const validatedReturnTo = validateRelativePath(stateObj.returnTo);
    const sanitizedReturnTo = validatedReturnTo.valid
      ? validatedReturnTo.sanitizedPath
      : null;

    let invite: MembershipInvitationResource | null = null;
    if (
      sanitizedReturnTo &&
      sanitizedReturnTo.startsWith("/api/login?inviteToken=")
    ) {
      const inviteUrl = new URL(sanitizedReturnTo, config.getApiBaseUrl());
      const inviteToken = inviteUrl.searchParams.get("inviteToken");
      if (inviteToken) {
        const inviteRes =
          await MembershipInvitationResource.getPendingForToken(inviteToken);
        if (inviteRes.isOk()) {
          invite = inviteRes.value;
        }
      }
    }

    if (invite) {
      // User has an invite on the current region - we want to keep the user here.
      targetRegion = currentRegion;
    } else if (userSessionRegion) {
      targetRegion = userSessionRegion;
    } else {
      // For new users or users without region, perform lookup.
      const regionWithAffinityRes = await checkUserRegionAffinity({
        email: user.email,
        email_verified: true, // WorkOS handles email verification
      });

      if (regionWithAffinityRes.isErr()) {
        throw regionWithAffinityRes.error;
      }

      if (regionWithAffinityRes.value.hasAffinity) {
        targetRegion = regionWithAffinityRes.value.region;
      } else {
        targetRegion = multiRegionsConfig.getCurrentRegion();
      }
    }

    // Safety check for target region
    if (targetRegion && !SUPPORTED_REGIONS.includes(targetRegion)) {
      logger.error(
        {
          targetRegion,
          currentRegion,
        },
        "Invalid target region during WorkOS callback"
      );
      targetRegion = multiRegionsConfig.getCurrentRegion();
    }

    // If wrong region, redirect to login with prompt=none on correct domain
    if (targetRegion !== currentRegion) {
      logger.info(
        {
          targetRegion,
          currentRegion,
        },
        "Redirecting to correct region"
      );
      const targetRegionInfo = multiRegionsConfig.getOtherRegionInfo();
      const params = new URLSearchParams();

      // Use sanitizedReturnTo if available, otherwise default to "/api/login"
      // so that the target region creates the user in its database.
      const returnTo = sanitizedReturnTo ?? "/api/login";

      params.set("returnTo", returnTo);
      if (organizationId) {
        params.set("organizationId", organizationId);
      }
      res.redirect(
        `${targetRegionInfo.url}/api/workos/login?${params.toString()}`
      );
      return;
    }

    // Set session cookie and redirect to returnTo URL
    const domain = config.getWorkOSSessionCookieDomain();
    // In development (localhost), omit Secure flag as it requires HTTPS
    // Safari strictly enforces this and will not set cookies with Secure flag on HTTP
    const secureFlag = isDevelopment() ? "" : "; Secure";

    // Indicator cookie for client-side session detection (UI only, not for auth).
    // Not HttpOnly so it can be read by JavaScript. Max-Age matches workos_session (30 days).
    const indicatorCookie = domain
      ? `${DUST_HAS_SESSION}=1; Domain=${domain}; Path=/${secureFlag}; SameSite=Lax; Max-Age=2592000`
      : `${DUST_HAS_SESSION}=1; Path=/${secureFlag}; SameSite=Lax; Max-Age=2592000`;

    if (domain) {
      res.setHeader("Set-Cookie", [
        `workos_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly${secureFlag}; SameSite=Lax`,
        `workos_session=${sealedCookie}; Domain=${domain}; Path=/; HttpOnly${secureFlag}; SameSite=Lax; Max-Age=2592000`,
        indicatorCookie,
      ]);
    } else {
      res.setHeader("Set-Cookie", [
        `workos_session=${sealedCookie}; Path=/; HttpOnly${secureFlag}; SameSite=Lax; Max-Age=2592000`,
        indicatorCookie,
      ]);
    }

    // Restore UTM params from state to the redirect URL for cross-domain tracking
    const utmParams: Record<string, string> = stateObj.utm ?? {};
    const appendUtmToUrl = (url: string): string => {
      if (Object.keys(utmParams).length === 0) {
        return url;
      }
      const [baseUrl, existingQuery] = url.split("?");
      const searchParams = new URLSearchParams(existingQuery ?? "");
      for (const [key, value] of Object.entries(utmParams)) {
        if (!searchParams.has(key)) {
          searchParams.set(key, value);
        }
      }
      const queryString = searchParams.toString();
      return queryString ? `${baseUrl}?${queryString}` : baseUrl;
    };

    if (sanitizedReturnTo) {
      redirectTo(res, appendUtmToUrl(sanitizedReturnTo));
      return;
    }

    redirectTo(res, appendUtmToUrl("/api/login"));
  } catch (error) {
    logger.error({ error }, "Error during WorkOS callback");

    // Emit user.login_failed if workspace context is available.
    // Login failures without a workspace context are not audit-logged — WorkOS captures those.
    if (callbackWorkspaceId) {
      const loginFailedAuth =
        await Authenticator.internalAdminForWorkspace(callbackWorkspaceId);
      void emitAuditLogEvent({
        auth: loginFailedAuth,
        action: "user.login_failed",
        targets: [
          buildWorkspaceTarget(loginFailedAuth.getNonNullableWorkspace()),
        ],
        metadata: {
          reason: normalizeError(error).message,
          authenticationMethod: "workos",
        },
      });
    }
    // Login failures without a workspace context are not audit-logged.
    // WorkOS captures these on their side.

    getStatsDClient().increment("login.callback.error", 1);
    redirectTo(res, `/login-error?type=workos-callback`);
  }
}

async function handleLogout(req: NextApiRequest, res: NextApiResponse) {
  const session = await getSession(req, res);

  if (session && session.type === "workos") {
    // Emit audit log before revoking the session.
    if (session.workspaceId) {
      const workspace = await WorkspaceResource.fetchById(session.workspaceId);
      if (workspace) {
        const user = await fetchUserFromSession(session);
        void emitAuditLogEventDirect({
          workspace: renderLightWorkspaceType({ workspace }),
          action: "user.logout",
          actor: {
            type: "user",
            id: user?.sId ?? "unknown",
            name: user?.name ?? session.user.name,
          },
          targets: [
            {
              type: "user",
              id: user?.sId ?? "unknown",
              name: user?.name ?? session.user.name,
            },
          ],
          context: { location: getClientIp(req) },
        });
      }
    }

    // Logout from WorkOS
    try {
      await getWorkOS().userManagement.revokeSession({
        sessionId: session.sessionId,
      });
    } catch (error) {
      logger.error({ error }, "Error during WorkOS logout");
    }
  }

  const domain = config.getWorkOSSessionCookieDomain();
  // In development (localhost), omit Secure flag as it requires HTTPS
  const secureFlag = isDevelopment() ? "" : "; Secure";

  // Clear both session cookie and indicator cookie
  if (domain) {
    res.setHeader("Set-Cookie", [
      `workos_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly${secureFlag}; SameSite=Lax`,
      `workos_session=; Domain=${domain}; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly${secureFlag}; SameSite=Lax`,
      `${DUST_HAS_SESSION}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureFlag}; SameSite=Lax`,
      `${DUST_HAS_SESSION}=; Domain=${domain}; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureFlag}; SameSite=Lax`,
    ]);
  } else {
    res.setHeader("Set-Cookie", [
      `workos_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly${secureFlag}; SameSite=Lax`,
      `${DUST_HAS_SESSION}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureFlag}; SameSite=Lax`,
    ]);
  }

  // Validate and sanitize returnTo parameter
  const { returnTo } = req.query;
  const validatedReturnTo = validateRelativePath(returnTo);
  const sanitizedReturnTo = validatedReturnTo.valid
    ? validatedReturnTo.sanitizedPath
    : config.getStaticWebsiteUrl();

  redirectTo(res, sanitizedReturnTo);
}

/**
 * Revoke a specific WorkOS session via API (same as handleLogout but accepts
 * session_id from request body instead of reading from cookie).
 * Used by the Chrome extension which authenticates with Bearer tokens.
 */
async function handleRevokeSession(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { session_id } = req.body;

  if (!session_id || !isString(session_id)) {
    return res.status(400).json({ error: "Invalid session_id" });
  }

  try {
    await getWorkOS().userManagement.revokeSession({
      sessionId: session_id,
    });
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error({ error }, "Error during WorkOS session revocation");
    return res.status(500).json({ error: "Session revocation failed" });
  }
}

function redirectTo(res: NextApiResponse, sanitizedReturnTo: string) {
  if (
    sanitizedReturnTo.startsWith("/api") ||
    sanitizedReturnTo.startsWith("http://") ||
    sanitizedReturnTo.startsWith("https://")
  ) {
    res.redirect(sanitizedReturnTo);
  } else {
    res.redirect(`${config.getAppUrl()}${sanitizedReturnTo}`);
  }
}
