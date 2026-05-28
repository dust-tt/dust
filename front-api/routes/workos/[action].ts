import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  emitAuditLogEventDirect,
} from "@app/lib/api/audit/workos_audit";
import config from "@app/lib/api/config";
import { performLogin } from "@app/lib/api/login";
import { config as multiRegionsConfig } from "@app/lib/api/regions/config";
import { checkUserRegionAffinity } from "@app/lib/api/regions/lookup";
import { authenticateWithWorkOSCode } from "@app/lib/api/workos/authenticate";
import { getWorkOS } from "@app/lib/api/workos/client";
import type { SessionCookie } from "@app/lib/api/workos/user";
import {
  getUserNicknameFromEmail,
  getWorkOSSessionWithSetCookies,
} from "@app/lib/api/workos/user";
import { Authenticator } from "@app/lib/auth";
import { DUST_HAS_SESSION } from "@app/lib/cookies";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { fetchUserFromSession } from "@app/lib/iam/users";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { getStatsDClient } from "@app/lib/utils/statsd";
import { extractUTMParams } from "@app/lib/utils/utm";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type { RegionType } from "@app/types/region";
import { SUPPORTED_REGIONS } from "@app/types/region";
import { isDevelopment } from "@app/types/shared/env";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import { validateRelativePath } from "@app/types/shared/utils/url_utils";
import { createHono } from "@front-api/lib/hono";
import { apiError } from "@front-api/middlewares/utils";
import { OauthException } from "@workos-inc/node";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { sealData } from "iron-session";

function isValidScreenHint(
  screenHint: string | undefined
): screenHint is "sign-up" | "sign-in" {
  return isString(screenHint) && ["sign-up", "sign-in"].includes(screenHint);
}

// Match Next's `res.redirect()` default (307).
function redirect(ctx: Context, url: string) {
  return ctx.redirect(url, 307);
}

function redirectTo(ctx: Context, sanitizedReturnTo: string) {
  if (
    sanitizedReturnTo.startsWith("/api") ||
    sanitizedReturnTo.startsWith("http://") ||
    sanitizedReturnTo.startsWith("https://")
  ) {
    return redirect(ctx, sanitizedReturnTo);
  }
  return redirect(ctx, `${config.getAppUrl()}${sanitizedReturnTo}`);
}

const app = createHono();

app.all("/", async (ctx) => {
  const action = ctx.req.param("action");
  switch (action) {
    case "login":
      return handleLogin(ctx);
    case "callback":
      return handleCallback(ctx);
    case "authenticate":
      return handleAuthenticate(ctx);
    case "logout":
      return handleLogout(ctx);
    case "revoke-session":
      if (ctx.req.method !== "POST") {
        return ctx.json({ error: "Method not allowed" }, 405);
      }
      return handleRevokeSession(ctx);
    default:
      return ctx.json({ error: "Invalid action" }, 400);
  }
});

async function handleLogin(ctx: Context) {
  try {
    const query = ctx.req.query();
    const {
      organizationId,
      screenHint,
      loginHint,
      returnTo,
      redirect_uri,
      code_challenge,
      code_challenge_method,
    } = query;

    const redirectUri = isString(redirect_uri)
      ? redirect_uri
      : `${config.getAuthRedirectBaseUrl()}/api/workos/callback`;

    let organizationIdToUse: string | undefined;
    if (isString(organizationId)) {
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
    const utmParams = extractUTMParams(query);
    const state = {
      ...(sanitizedReturnTo ? { returnTo: sanitizedReturnTo } : {}),
      ...(organizationIdToUse ? { organizationId: organizationIdToUse } : {}),
      ...(Object.keys(utmParams).length > 0 ? { utm: utmParams } : {}),
    };

    const authorizationUrl = getWorkOS().userManagement.getAuthorizationUrl({
      provider: "authkit",
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

    return redirect(ctx, authorizationUrl);
  } catch (error) {
    logger.error({ error }, "Error during WorkOS login");
    getStatsDClient().increment("login.error", 1);
    return redirect(ctx, "/login-error?type=workos-login");
  }
}

async function handleAuthenticate(ctx: Context) {
  const body = await ctx.req.json().catch(() => ({}));
  const { code, grant_type, refresh_token, code_verifier } = body;

  if (grant_type && !isString(grant_type)) {
    return ctx.json(
      { error: "Invalid grant_type", type: "invalid_request_error" },
      400
    );
  }

  if (grant_type === "refresh_token") {
    if (!refresh_token || !isString(refresh_token)) {
      return ctx.json(
        { error: "Invalid refresh token", type: "invalid_request_error" },
        400
      );
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

      return ctx.json({
        ...result,
        expirationDate: jwtPayload.exp * 1000,
      });
    } catch (error) {
      if (error instanceof OauthException) {
        return ctx.json(
          { error: error.errorDescription, type: error.error },
          error.status as 400 | 401 | 403 | 404 | 500
        );
      }
      logger.error({ error }, "Error during WorkOS token refresh");
      return ctx.json(
        { error: "Authentication failed", type: "internal_server_error" },
        500
      );
    }
  }

  if (!code || !isString(code)) {
    return ctx.json({ error: "Invalid code" }, 400);
  }

  if (code_verifier && !isString(code_verifier)) {
    return ctx.json({ error: "Invalid code verifier" }, 400);
  }

  try {
    const authResult = await authenticateWithWorkOSCode({
      code,
      codeVerifier: code_verifier,
    });

    const jwtPayload = JSON.parse(
      Buffer.from(authResult.accessToken.split(".")[1], "base64").toString()
    );
    const expiresIn = jwtPayload.exp
      ? jwtPayload.exp - Math.floor(Date.now() / 1000)
      : undefined;

    return ctx.json({
      ...authResult,
      expiresIn,
      expirationDate: jwtPayload.exp * 1000,
    });
  } catch (error) {
    if (error instanceof OauthException) {
      return ctx.json(
        { error: error.errorDescription, type: error.error },
        error.status as 400 | 401 | 403 | 404 | 500
      );
    }
    logger.error({ error }, "Error during WorkOS authentication");
    return ctx.json(
      { error: "Authentication failed", type: "internal_server_error" },
      500
    );
  }
}

async function handleCallback(ctx: Context) {
  const { code, state } = ctx.req.query();
  if (!code || !isString(code)) {
    return redirectTo(
      ctx,
      "/login-error?reason=invalid-code&type=workos-callback"
    );
  }

  const stateObj = isString(state)
    ? JSON.parse(Buffer.from(state, "base64").toString("utf-8"))
    : {};

  let callbackWorkspaceId: string | undefined;
  let callbackUserEmail: string | undefined;

  try {
    const {
      user,
      organizationId,
      authenticationMethod,
      sealedSession,
      accessToken,
    } = await authenticateWithWorkOSCode({
      code,
      organizationId: stateObj.organizationId,
    });
    callbackUserEmail = user.email;

    if (!sealedSession) {
      throw new Error("Sealed session not found");
    }

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

    const currentRegion = multiRegionsConfig.getCurrentRegion();
    let targetRegion: RegionType | null = "us-central1";

    const userSessionRegion = sessionCookie.region;
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
      targetRegion = currentRegion;
    } else if (userSessionRegion) {
      targetRegion = userSessionRegion;
    } else {
      const regionWithAffinityRes = await checkUserRegionAffinity({
        email: user.email,
        email_verified: true,
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

    if (targetRegion && !SUPPORTED_REGIONS.includes(targetRegion)) {
      logger.error(
        { targetRegion, currentRegion },
        "Invalid target region during WorkOS callback"
      );
      targetRegion = multiRegionsConfig.getCurrentRegion();
    }

    if (targetRegion !== currentRegion) {
      logger.info(
        { targetRegion, currentRegion },
        "Redirecting to correct region"
      );
      const targetRegionInfo = multiRegionsConfig.getOtherRegionInfo();
      const params = new URLSearchParams();
      const returnTo = sanitizedReturnTo ?? "/api/login";
      params.set("returnTo", returnTo);
      if (organizationId) {
        params.set("organizationId", organizationId);
      }
      return redirect(
        ctx,
        `${targetRegionInfo.url}/api/workos/login?${params.toString()}`
      );
    }

    const domain = config.getWorkOSSessionCookieDomain();
    const secureFlag = isDevelopment() ? "" : "; Secure";

    const indicatorCookie = domain
      ? `${DUST_HAS_SESSION}=1; Domain=${domain}; Path=/${secureFlag}; SameSite=Lax; Max-Age=2592000`
      : `${DUST_HAS_SESSION}=1; Path=/${secureFlag}; SameSite=Lax; Max-Age=2592000`;

    if (domain) {
      ctx.header(
        "Set-Cookie",
        `workos_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly${secureFlag}; SameSite=Lax`,
        { append: true }
      );
      ctx.header(
        "Set-Cookie",
        `workos_session=${sealedCookie}; Domain=${domain}; Path=/; HttpOnly${secureFlag}; SameSite=Lax; Max-Age=2592000`,
        { append: true }
      );
      ctx.header("Set-Cookie", indicatorCookie, { append: true });
    } else {
      ctx.header(
        "Set-Cookie",
        `workos_session=${sealedCookie}; Path=/; HttpOnly${secureFlag}; SameSite=Lax; Max-Age=2592000`,
        { append: true }
      );
      ctx.header("Set-Cookie", indicatorCookie, { append: true });
    }

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

    const loginSession: SessionWithUser = {
      type: "workos",
      sessionId: decodedPayload.sid ?? "",
      region: sessionCookie.region,
      user: {
        email: user.email,
        email_verified: user.emailVerified,
        name: user.email ?? "",
        family_name: user.lastName ?? "",
        given_name: user.firstName ?? "",
        nickname: getUserNicknameFromEmail(user.email) ?? "",
        workOSUserId: user.id,
      },
      organizationId,
      workspaceId: sessionCookie.workspaceId,
      isSSO: authenticationMethod?.toLowerCase() === "sso",
      authenticationMethod,
    };

    const loginOptions = (() => {
      const base = {
        inviteToken: null as string | null,
        wId: null as string | null,
        join: false,
        conversationId: null as string | null,
        utmParams,
        returnTo: null as string | null,
      };
      if (!sanitizedReturnTo) {
        return base;
      }
      const parsed = new URL(sanitizedReturnTo, config.getApiBaseUrl());
      if (parsed.pathname === "/api/login") {
        return {
          ...base,
          inviteToken: parsed.searchParams.get("inviteToken"),
          wId: parsed.searchParams.get("wId"),
          join: parsed.searchParams.get("join") === "true",
          conversationId: parsed.searchParams.get("cId"),
        };
      }
      return { ...base, returnTo: appendUtmToUrl(sanitizedReturnTo) };
    })();

    const outcome = await performLogin(
      {
        cookieHeader: ctx.req.header("cookie"),
        forwardedFor: ctx.req.header("x-forwarded-for"),
        remoteAddress: undefined,
      },
      loginSession,
      loginOptions
    );

    switch (outcome.kind) {
      case "redirect":
        return redirect(ctx, outcome.url);
      case "unauthorized":
        return ctx.body(null, 401);
      case "apiError":
        return apiError(ctx, outcome.error);
      default:
        assertNever(outcome);
    }
  } catch (error) {
    logger.error({ error }, "Error during WorkOS callback");

    // Emit user.login_failed when workspace context is available. Login
    // failures without workspace context are not audit-logged because audit
    // logs are workspace-scoped — WorkOS captures those on their side.
    // When the workspace is known but the user email isn't (e.g. failure
    // before authenticateWithWorkOSCode could resolve), fall back to
    // "unknown" for the user target so emit and schema targets always match.
    if (callbackWorkspaceId) {
      const loginFailedAuth =
        await Authenticator.internalAdminForWorkspace(callbackWorkspaceId);
      const userIdentifier = callbackUserEmail ?? "unknown";
      void emitAuditLogEvent({
        auth: loginFailedAuth,
        action: "user.login_failed",
        targets: [
          buildAuditLogTarget(
            "workspace",
            loginFailedAuth.getNonNullableWorkspace()
          ),
          // Follow the member.invited pattern: when we don't have a Dust
          // UserResource (the user may never have signed up here), use the
          // email as the user target's sId.
          buildAuditLogTarget("user", {
            sId: userIdentifier,
            name: userIdentifier,
          }),
        ],
        metadata: {
          reason: normalizeError(error).message,
          authentication_method: "workos",
        },
      });
    }

    getStatsDClient().increment("login.callback.error", 1);
    return redirectTo(ctx, `/login-error?type=workos-callback`);
  }
}

async function handleLogout(ctx: Context) {
  const result = await getWorkOSSessionWithSetCookies(
    getCookie(ctx, "workos_session")
  );
  for (const cookie of result.setCookies) {
    ctx.header("Set-Cookie", cookie, { append: true });
  }
  const session = result.session;

  if (session && session.type === "workos") {
    if (session.workspaceId) {
      const workspace = await WorkspaceResource.fetchById(session.workspaceId);
      if (workspace) {
        const user = await fetchUserFromSession(session);
        const forwarded = ctx.req.header("x-forwarded-for");
        const clientIp = forwarded?.split(",")[0]?.trim() ?? "internal";
        void emitAuditLogEventDirect({
          workspace: renderLightWorkspaceType({ workspace }),
          action: "user.logout",
          actor: {
            type: "user",
            id: user?.sId ?? "unknown",
            name: user?.name ?? session.user.name,
          },
          targets: [
            buildAuditLogTarget("user", {
              sId: user?.sId ?? "unknown",
              name: user?.name ?? session.user.name,
            }),
          ],
          context: { location: clientIp },
        });
      }
    }

    try {
      await getWorkOS().userManagement.revokeSession({
        sessionId: session.sessionId,
      });
    } catch (error) {
      logger.error({ error }, "Error during WorkOS logout");
    }
  }

  const domain = config.getWorkOSSessionCookieDomain();
  const secureFlag = isDevelopment() ? "" : "; Secure";

  if (domain) {
    ctx.header(
      "Set-Cookie",
      `workos_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly${secureFlag}; SameSite=Lax`,
      { append: true }
    );
    ctx.header(
      "Set-Cookie",
      `workos_session=; Domain=${domain}; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly${secureFlag}; SameSite=Lax`,
      { append: true }
    );
    ctx.header(
      "Set-Cookie",
      `${DUST_HAS_SESSION}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureFlag}; SameSite=Lax`,
      { append: true }
    );
    ctx.header(
      "Set-Cookie",
      `${DUST_HAS_SESSION}=; Domain=${domain}; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureFlag}; SameSite=Lax`,
      { append: true }
    );
  } else {
    ctx.header(
      "Set-Cookie",
      `workos_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly${secureFlag}; SameSite=Lax`,
      { append: true }
    );
    ctx.header(
      "Set-Cookie",
      `${DUST_HAS_SESSION}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureFlag}; SameSite=Lax`,
      { append: true }
    );
  }

  const returnTo = ctx.req.query("returnTo");
  const validatedReturnTo = validateRelativePath(returnTo);
  const sanitizedReturnTo = validatedReturnTo.valid
    ? validatedReturnTo.sanitizedPath
    : config.getStaticWebsiteUrl();

  return redirectTo(ctx, sanitizedReturnTo);
}

/**
 * Revoke a specific WorkOS session via API (same as handleLogout but accepts
 * session_id from the request body instead of reading from cookie).
 * Used by the Chrome extension which authenticates with Bearer tokens.
 */
async function handleRevokeSession(ctx: Context) {
  const body = await ctx.req.json().catch(() => ({}));
  const { session_id } = body;

  if (!session_id || !isString(session_id)) {
    return ctx.json({ error: "Invalid session_id" }, 400);
  }

  try {
    await getWorkOS().userManagement.revokeSession({
      sessionId: session_id,
    });
    return ctx.json({ success: true });
  } catch (error) {
    logger.error({ error }, "Error during WorkOS session revocation");
    return ctx.json({ error: "Session revocation failed" }, 500);
  }
}

export default app;
