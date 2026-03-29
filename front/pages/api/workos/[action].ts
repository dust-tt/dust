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
import { getSession } from "@app/lib/auth";
import { DUST_HAS_SESSION } from "@app/lib/cookies";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { getStatsDClient } from "@app/lib/utils/statsd";
import { extractUTMParams } from "@app/lib/utils/utm";
import logger from "@app/logger/logger";

import { isDevelopment } from "@app/types/shared/env";
import { isString } from "@app/types/shared/utils/general";
import { validateRelativePath } from "@app/types/shared/utils/url_utils";
import { GenericServerException, OauthException } from "@workos-inc/node";
import crypto from "crypto";
import { sealData } from "iron-session";
import type { NextApiRequest, NextApiResponse } from "next";

const OAUTH_NONCE_COOKIE = "workos_oauth_nonce";
const OAUTH_NONCE_MAX_AGE_SECONDS = 600; // 10 minutes — matches typical auth code TTL

function getSessionCookieParams(): {
  domain: string | undefined;
  secureFlag: string;
} {
  return {
    domain: config.getWorkOSSessionCookieDomain(),
    secureFlag: isDevelopment() ? "" : "; Secure",
  };
}

function buildExpiredCookie(
  name: string,
  path: string,
  domain: string | undefined,
  secureFlag: string
): string {
  const domainAttr = domain ? `; Domain=${domain}` : "";
  return `${name}=${domainAttr}; Path=${path}; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly${secureFlag}; SameSite=Lax`;
}

/**
 * Decode the payload of a JWT without signature verification.
 * Safe here because the token was just received from WorkOS over an authenticated TLS channel.
 * Do NOT copy this pattern for tokens received from untrusted sources.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function decodeJwtPayload(token: string): Record<string, any> {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) {
    throw new Error("Invalid JWT format: expected 3 dot-separated segments");
  }
  return JSON.parse(Buffer.from(parts[1], "base64").toString());
}

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

    const defaultRedirectUri = `${config.getAuthRedirectBaseUrl()}/api/workos/callback`;
    const redirectUri = getValidatedRedirectUri(
      redirect_uri,
      defaultRedirectUri
    );

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

    // Generate a cryptographic nonce to bind the OAuth flow to this browser session,
    // preventing login CSRF / session fixation attacks (RFC 6749 Section 10.12).
    const oauthNonce = crypto.randomBytes(32).toString("base64url");
    const state = {
      nonce: oauthNonce,
      ...(sanitizedReturnTo ? { returnTo: sanitizedReturnTo } : {}),
      ...(organizationIdToUse ? { organizationId: organizationIdToUse } : {}),
      ...(Object.keys(utmParams).length > 0 ? { utm: utmParams } : {}),
    };

    // State always has at least the nonce, so it's never empty.
    const encodedState = Buffer.from(JSON.stringify(state)).toString("base64");

    const authorizationUrl = getWorkOS().userManagement.getAuthorizationUrl({
      // Specify that we'd like AuthKit to handle the authentication flow
      provider: "authkit",
      // Use auth redirect base URL for WorkOS callbacks
      redirectUri,
      clientId: config.getWorkOSClientId(),
      ...enterpriseParams,
      state: encodedState,
      ...(isValidScreenHint(screenHint) ? { screenHint } : {}),
      ...(isString(loginHint) ? { loginHint } : {}),
      ...(isString(code_challenge) ? { codeChallenge: code_challenge } : {}),
      ...(isString(code_challenge_method) && code_challenge_method === "S256"
        ? { codeChallengeMethod: code_challenge_method }
        : {}),
    });

    // Store the nonce in an HttpOnly cookie so the callback can verify the flow
    // originated from this browser session.
    const { domain, secureFlag } = getSessionCookieParams();
    const domainAttr = domain ? `; Domain=${domain}` : "";
    const nonceCookie = `${OAUTH_NONCE_COOKIE}=${oauthNonce}${domainAttr}; Path=/api/workos/callback; HttpOnly${secureFlag}; SameSite=Lax; Max-Age=${OAUTH_NONCE_MAX_AGE_SECONDS}`;

    res.setHeader("Set-Cookie", nonceCookie);
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

    const jwtPayload = decodeJwtPayload(authResult.accessToken);
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stateObj: Record<string, any>;
  try {
    stateObj = isString(state)
      ? JSON.parse(Buffer.from(state, "base64").toString("utf-8"))
      : {};
  } catch {
    return redirectTo(
      res,
      "/login-error?reason=invalid-state&type=workos-callback"
    );
  }

  // Clear the nonce cookie immediately (single-use) regardless of outcome.
  const { domain, secureFlag } = getSessionCookieParams();
  const clearNonceCookie = buildExpiredCookie(
    OAUTH_NONCE_COOKIE,
    "/api/workos/callback",
    domain,
    secureFlag
  );

  // Verify the OAuth nonce to prevent login CSRF / session fixation.
  // The nonce in the state must match the one stored in the browser's cookie.
  // Use constant-time comparison to prevent timing side-channel leakage.
  const nonceCookie = req.cookies[OAUTH_NONCE_COOKIE];
  const nonceMatch =
    isString(stateObj.nonce) &&
    isString(nonceCookie) &&
    stateObj.nonce.length === nonceCookie.length &&
    crypto.timingSafeEqual(
      Buffer.from(stateObj.nonce),
      Buffer.from(nonceCookie)
    );
  if (!nonceMatch) {
    logger.warn(
      { hasNonce: !!stateObj.nonce, hasCookie: !!nonceCookie },
      "OAuth callback nonce mismatch — possible CSRF attempt"
    );
    getStatsDClient().increment("login.callback.nonce_mismatch");
    res.setHeader("Set-Cookie", clearNonceCookie);
    return redirectTo(
      res,
      "/login-error?reason=nonce-mismatch&type=workos-callback"
    );
  }

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

    const decodedPayload = decodeJwtPayload(accessToken);

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
      res.setHeader("Set-Cookie", clearNonceCookie);
      res.redirect(
        `${targetRegionInfo.url}/api/workos/login?${params.toString()}`
      );
      return;
    }

    // Set session cookie and redirect to returnTo URL.
    // domain and secureFlag are already defined above (nonce cleanup).

    // Indicator cookie for client-side session detection (UI only, not for auth).
    // Not HttpOnly so it can be read by JavaScript. Max-Age matches workos_session (30 days).
    const indicatorCookie = domain
      ? `${DUST_HAS_SESSION}=1; Domain=${domain}; Path=/${secureFlag}; SameSite=Lax; Max-Age=2592000`
      : `${DUST_HAS_SESSION}=1; Path=/${secureFlag}; SameSite=Lax; Max-Age=2592000`;

    if (domain) {
      res.setHeader("Set-Cookie", [
        clearNonceCookie,
        `workos_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly${secureFlag}; SameSite=Lax`,
        `workos_session=${sealedCookie}; Domain=${domain}; Path=/; HttpOnly${secureFlag}; SameSite=Lax; Max-Age=2592000`,
        indicatorCookie,
      ]);
    } else {
      res.setHeader("Set-Cookie", [
        clearNonceCookie,
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
    getStatsDClient().increment("login.callback.error", 1);
    res.setHeader("Set-Cookie", clearNonceCookie);
    redirectTo(res, `/login-error?type=workos-callback`);
  }
}

async function handleLogout(req: NextApiRequest, res: NextApiResponse) {
  const session = await getSession(req, res);

  if (session && session.type === "workos") {
    // Logout from WorkOS
    try {
      await getWorkOS().userManagement.revokeSession({
        sessionId: session.sessionId,
      });
    } catch (error) {
      logger.error({ error }, "Error during WorkOS logout");
    }
  }

  const { domain, secureFlag } = getSessionCookieParams();

  // Clear both session cookie and indicator cookie.
  // buildExpiredCookie sets HttpOnly; the indicator cookie is not HttpOnly (JS-readable),
  // so we build it inline with the same expiry pattern.
  const expiredIndicator = domain
    ? `${DUST_HAS_SESSION}=; Domain=${domain}; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureFlag}; SameSite=Lax`
    : `${DUST_HAS_SESSION}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureFlag}; SameSite=Lax`;

  if (domain) {
    res.setHeader("Set-Cookie", [
      buildExpiredCookie("workos_session", "/", undefined, secureFlag),
      buildExpiredCookie("workos_session", "/", domain, secureFlag),
      expiredIndicator,
      `${DUST_HAS_SESSION}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureFlag}; SameSite=Lax`,
    ]);
  } else {
    res.setHeader("Set-Cookie", [
      buildExpiredCookie("workos_session", "/", undefined, secureFlag),
      expiredIndicator,
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

// Lazily cached set of allowed origins for redirect_uri validation.
let cachedAllowedOrigins: Set<string> | null = null;
function getAllowedRedirectOrigins(): Set<string> {
  if (!cachedAllowedOrigins) {
    const urls = [
      config.getClientFacingUrl(),
      config.getAuthRedirectBaseUrl(),
      config.getAppUrl(),
    ];
    cachedAllowedOrigins = new Set(
      urls.flatMap((u) => {
        try {
          return [new URL(u).origin];
        } catch {
          return [];
        }
      })
    );
  }
  return cachedAllowedOrigins;
}

/**
 * Validates redirect_uri against an allowlist of trusted origins.
 * Falls back to the default callback URI if the provided value is missing or untrusted.
 * Defense-in-depth: WorkOS also validates redirect_uri against its dashboard config,
 * but we should not rely solely on external validation.
 */
function getValidatedRedirectUri(
  redirectUri: string | string[] | undefined,
  defaultUri: string
): string {
  if (!redirectUri || !isString(redirectUri)) {
    return defaultUri;
  }

  // Allow relative paths starting with /api/workos/callback (same origin).
  if (redirectUri === "/api/workos/callback") {
    return redirectUri;
  }

  try {
    const parsed = new URL(redirectUri);
    if (
      getAllowedRedirectOrigins().has(parsed.origin) &&
      parsed.pathname === "/api/workos/callback"
    ) {
      return redirectUri;
    }
  } catch {
    // Invalid URL — fall through to default.
  }

  logger.warn(
    { redirectUri },
    "Rejected untrusted redirect_uri in OAuth login"
  );
  return defaultUri;
}

function redirectTo(res: NextApiResponse, sanitizedReturnTo: string) {
  if (sanitizedReturnTo.startsWith("/")) {
    // Relative path — prefix with app URL unless it's an API path.
    if (sanitizedReturnTo.startsWith("/api")) {
      res.redirect(sanitizedReturnTo);
    } else {
      res.redirect(`${config.getAppUrl()}${sanitizedReturnTo}`);
    }
    return;
  }

  // Absolute URL — only allow trusted origins.
  try {
    const parsed = new URL(sanitizedReturnTo);
    if (getAllowedRedirectOrigins().has(parsed.origin)) {
      res.redirect(sanitizedReturnTo);
      return;
    }
  } catch {
    // Invalid URL — fall through to safe default.
  }

  logger.warn(
    { sanitizedReturnTo },
    "redirectTo rejected untrusted absolute URL, falling back to app root"
  );
  res.redirect(config.getAppUrl());
}
