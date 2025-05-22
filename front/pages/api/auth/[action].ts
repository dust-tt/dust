import { WorkOS } from "@workos-inc/node";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { getSession } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";

const workos = new WorkOS(config.getWorkOSApiKey(), {
  clientId: config.getWorkOSClientId(),
});

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
    const authorizationUrl = workos.userManagement.getAuthorizationUrl({
      // Specify that we'd like AuthKit to handle the authentication flow
      provider: "authkit",
      redirectUri: config.getWorkOSRedirectUri(),
      clientId: config.getWorkOSClientId(),
    });

    res.redirect(authorizationUrl);
  } catch (error) {
    logger.error({ error }, "Error during WorkOS login");
    statsDClient.increment("login.error", 1);
    res.redirect("/login-error");
  }
}

async function handleCallback(req: NextApiRequest, res: NextApiResponse) {
  const { code } = req.query;
  if (!code || typeof code !== "string") {
    return res.redirect("/login-error");
  }

  try {
    const { user, sealedSession, organizationId, authenticationMethod } =
      await workos.userManagement.authenticateWithCode({
        code,
        clientId: config.getWorkOSClientId(),
        session: {
          sealSession: true,
          cookiePassword: config.getWorkOSCookiePassword(),
        },
      });

    logger.info(
      { user, organizationId, authenticationMethod },
      "WorkOS callback"
    );

    //TODO(workos): Add info in sealed session: (organizationId, authenticationMethod).

    //TODO(workos): Handle region redirect.
    // const currentRegion = multiRegionsConfig.getCurrentRegion();
    // let targetRegion: RegionType | null = "us-central1";

    // If user has a region, redirect to the region page.
    // const userSessionRegion = getRegionForUserSession({ user: user });
    // if (userSessionRegion) {
    //   targetRegion = userSessionRegion;
    // } else {
    //   // For new users or users without region, perform lookup.
    //   const regionWithAffinityRes = await checkUserRegionAffinity({
    //     email: user.email,
    //     email_verified: true, // WorkOS handles email verification
    //   });

    //   if (regionWithAffinityRes.isErr()) {
    //     throw regionWithAffinityRes.error;
    //   }

    //   if (regionWithAffinityRes.value.hasAffinity) {
    //     targetRegion = regionWithAffinityRes.value.region;
    //   } else {
    //     targetRegion = multiRegionsConfig.getCurrentRegion();
    //   }

    //   // await setRegionForUser({ user: profile }, targetRegion);
    // }

    // // Safety check for target region
    // if (targetRegion && !SUPPORTED_REGIONS.includes(targetRegion)) {
    //   logger.error(
    //     {
    //       targetRegion,
    //       currentRegion,
    //     },
    //     "Invalid target region during WorkOS callback"
    //   );
    //   targetRegion = multiRegionsConfig.getCurrentRegion();
    //   await setRegionForUser({ user: profile }, targetRegion);
    // }

    // // If wrong region, redirect to login with prompt=none on correct domain
    // if (targetRegion !== currentRegion) {
    //   logger.info(
    //     {
    //       targetRegion,
    //       currentRegion,
    //     },
    //     "Redirecting to correct region"
    //   );
    //   const targetRegionInfo = multiRegionsConfig.getOtherRegionInfo();
    //   const params = new URLSearchParams();

    //   let returnTo = "/";
    //   try {
    //     const stateObj = JSON.parse(state as string);
    //     if (stateObj.returnTo) {
    //       const url = new URL(stateObj.returnTo);
    //       returnTo = url.pathname + url.search;
    //     }
    //   } catch {
    //     // Fallback if URL parsing fails
    //   }

    //   params.set("returnTo", returnTo);
    //   res.redirect(
    //     `${targetRegionInfo.url}/api/auth/workos/login?${params.toString()}`
    //   );
    //   return;
    // }

    // Set session cookie and redirect to returnTo URL

    res.setHeader(
      "Set-Cookie",
      `session=${sealedSession}; Path=/; HttpOnly; Secure;SameSite=Lax`
    );

    res.redirect("/api/login");
  } catch (error) {
    logger.error({ error }, "Error during WorkOS callback");
    statsDClient.increment("login.callback.error", 1);
    res.redirect("/login-error");
  }
}

async function handleLogout(req: NextApiRequest, res: NextApiResponse) {
  const returnTo = req.query.returnTo || config.getClientFacingUrl();

  const session = await getSession(req);

  if (session) {
    // Logout from WorkOS
    try {
      await workos.userManagement.revokeSession({
        sessionId: session.sessionId,
      });
    } catch (error) {
      logger.error({ error }, "Error during WorkOS logout");
    }
  }

  res.setHeader(
    "Set-Cookie",
    "session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax"
  );

  res.redirect(returnTo as string);
}
