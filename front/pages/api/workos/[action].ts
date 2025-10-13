import { GenericServerException } from "@workos-inc/node";
import { sealData } from "iron-session";
import type { NextApiRequest, NextApiResponse } from "next";

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
import { setRegionForUser } from "@app/lib/api/workos/user";
import { getSession } from "@app/lib/auth";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";
import { isString } from "@app/types";

function isValidScreenHint(
  screenHint: string | string[] | undefined
): screenHint is "sign-up" | "sign-in" {
  return isString(screenHint) && ["sign-up", "sign-in"].includes(screenHint);
}

//TODO(workos): This file could be split in 3 route handlers.
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
    case "logout":
      return handleLogout(req, res);
    default:
      return res.status(400).json({ error: "Invalid action" });
  }
}

async function handleLogin(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { organizationId, screenHint, loginHint, returnTo } = req.query;

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

    const state = {
      ...(returnTo ? { returnTo } : {}),
      ...(organizationIdToUse ? { organizationId: organizationIdToUse } : {}),
    };

    const authorizationUrl = getWorkOS().userManagement.getAuthorizationUrl({
      // Specify that we'd like AuthKit to handle the authentication flow
      provider: "authkit",
      redirectUri: `${config.getClientFacingUrl()}/api/workos/callback`,
      clientId: config.getWorkOSClientId(),
      ...enterpriseParams,
      state:
        Object.keys(state).length > 0
          ? Buffer.from(JSON.stringify(state)).toString("base64")
          : undefined,
      ...(isValidScreenHint(screenHint) ? { screenHint } : {}),
      ...(isString(loginHint) ? { loginHint } : {}),
    });

    res.redirect(authorizationUrl);
  } catch (error) {
    logger.error({ error }, "Error during WorkOS login");
    statsDClient.increment("login.error", 1);
    res.redirect("/login-error?type=workos-login");
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
    return res.redirect(
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
      region: decodedPayload["https://dust.tt/region"],
      workspaceId: decodedPayload["https://dust.tt/workspaceId"],
    };

    const sealedCookie = await sealData(sessionCookie, {
      password: config.getWorkOSCookiePassword(),
    });

    const currentRegion = multiRegionsConfig.getCurrentRegion();
    let targetRegion: RegionType | null = "us-central1";

    // If user has a region, redirect to the region page.
    const userSessionRegion = sessionCookie.region;

    let invite: MembershipInvitationResource | null = null;
    if (
      isString(stateObj.returnTo) &&
      stateObj.returnTo.startsWith("/api/login?inviteToken=")
    ) {
      const inviteUrl = new URL(stateObj.returnTo, config.getClientFacingUrl());
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
      await setRegionForUser(user, targetRegion);
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

      await setRegionForUser(user, targetRegion);
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
      await setRegionForUser(user, targetRegion);
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

      let returnTo = "/";
      try {
        if (isString(stateObj.returnTo)) {
          const url = new URL(stateObj.returnTo);
          returnTo = url.pathname + url.search;
        }
      } catch {
        // Fallback if URL parsing fails
      }

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
    if (domain) {
      res.setHeader("Set-Cookie", [
        "workos_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax",
        `workos_session=${sealedCookie}; Domain=${domain}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
      ]);
    } else {
      res.setHeader("Set-Cookie", [
        `workos_session=${sealedCookie}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
      ]);
    }

    if (isString(stateObj.returnTo)) {
      res.redirect(stateObj.returnTo);
      return;
    }

    res.redirect("/api/login");
  } catch (error) {
    logger.error({ error }, "Error during WorkOS callback");
    statsDClient.increment("login.callback.error", 1);
    res.redirect("/login-error?type=workos-callback");
  }
}

async function handleLogout(req: NextApiRequest, res: NextApiResponse) {
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const returnTo = req.query.returnTo || config.getClientFacingUrl();

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
  if (domain) {
    res.setHeader("Set-Cookie", [
      "workos_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax",
      `workos_session=; Domain=${domain}; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`,
    ]);
  } else {
    res.setHeader("Set-Cookie", [
      "workos_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax",
    ]);
  }

  res.redirect(returnTo as string);
}
