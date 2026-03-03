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
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { extractUTMParams } from "@app/lib/utils/utm";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";
import { isDevelopment } from "@app/types/shared/env";
import { isString } from "@app/types/shared/utils/general";
import { validateRelativePath } from "@app/types/shared/utils/url_utils";
import { GenericServerException } from "@workos-inc/node";
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
    case "logout-url":
      return handleLogoutUrl(req, res);
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
      workspaceId,
      code_challenge,
      code_challenge_method,
    } = req.query;

    const redirectUri =
      redirect_uri && isString(redirect_uri)
        ? redirect_uri
        : `${config.getAuthRedirectBaseUrl()}/api/workos/callback`;

    let organizationIdToUse;

    if (workspaceId && isString(workspaceId)) {
      const workspace = workspaceId
        ? await WorkspaceResource.fetchById(workspaceId)
        : null;

      if (!workspace?.workOSOrganizationId) {
        res.status(400).json({
          error: "Workspace does not have a WorkOS organization ID",
        });
        return;
      }
      organizationIdToUse = workspace.workOSOrganizationId;
    }

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
    statsDClient.increment("login.error", 1);
    res.redirect("/login-error?type=workos-login");
  }
}

async function handleAuthenticate(req: NextApiRequest, res: NextApiResponse) {
  const { code, grant_type, refresh_token, code_verifier } = req.body;

  if (grant_type && !isString(grant_type)) {
    return res.status(400).json({ error: "Invalid grant_type" });
  }

  if (grant_type === "refresh_token") {
    if (!refresh_token || !isString(refresh_token)) {
      return res.status(400).json({ error: "Invalid refresh token" });
    }
    try {
      const result =
        await getWorkOS().userManagement.authenticateWithRefreshToken({
          refreshToken: refresh_token,
          clientId: config.getWorkOSClientId(),
        });
      return res.status(200).json(result);
    } catch (error) {
      logger.error({ error }, "Error during WorkOS token refresh");
      return res.status(500).json({ error: "Authentication failed" });
    }
  }

  if (!code || !isString(code)) {
    return res.status(400).json({ error: "Invalid code" });
  }
  try {
    const authResult =
      code_verifier && isString(code_verifier)
        ? await getWorkOS().userManagement.authenticateWithCodeAndVerifier({
            code,
            codeVerifier: code_verifier,
            clientId: config.getWorkOSClientId(),
          })
        : await authenticate(code);

    const jwtPayload = JSON.parse(
      Buffer.from(authResult.accessToken.split(".")[1], "base64").toString()
    );
    const expiresIn = jwtPayload.exp
      ? jwtPayload.exp - Math.floor(Date.now() / 1000)
      : undefined;

    return res.status(200).json({ ...authResult, expiresIn });
  } catch (error) {
    logger.error({ error }, "Error during WorkOS authentication");
    return res.status(500).json({ error: "Authentication failed" });
  }
}

async function authenticate(code: string, organizationId?: string) {
  try {
    return await getWorkOS().userManagement.authenticateWithCode({
      code,
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

  try {
    const {
      user,
      organizationId,
      authenticationMethod,
      sealedSession,
      accessToken,
    } = await authenticate(code, stateObj.organizationId);

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
      const inviteUrl = new URL(sanitizedReturnTo, config.getClientFacingUrl());
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

      // Use sanitizedReturnTo if available, otherwise default to "/"
      const returnTo = sanitizedReturnTo ?? "/";

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
    statsDClient.increment("login.callback.error", 1);
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
    : config.getClientFacingUrl();

  redirectTo(res, sanitizedReturnTo);
}

async function handleLogoutUrl(req: NextApiRequest, res: NextApiResponse) {
  const { session_id, returnTo } = req.query;

  if (!session_id || !isString(session_id)) {
    return res.status(400).json({ error: "Invalid session_id" });
  }
  const logoutUrl = getWorkOS().userManagement.getLogoutUrl({
    sessionId: session_id,
    returnTo: isString(returnTo) ? returnTo : undefined,
  });

  return res.redirect(logoutUrl);
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
