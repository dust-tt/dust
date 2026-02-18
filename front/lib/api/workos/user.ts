import config from "@app/lib/api/config";
import type { RegionType } from "@app/lib/api/regions/config";
import { config as multiRegionsConfig } from "@app/lib/api/regions/config";
import { getWorkOS } from "@app/lib/api/workos/client";
import { invalidateWorkOSOrganizationsCacheForUserId } from "@app/lib/api/workos/organization_membership";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { cacheWithRedis } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import { isDevelopment } from "@app/types/shared/env";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";
import { sha256 } from "@app/types/shared/utils/hashing";
import type { LightWorkspaceType } from "@app/types/user";
import type {
  AuthenticateWithSessionCookieFailedResponse,
  AuthenticateWithSessionCookieSuccessResponse,
  RefreshSessionResponse,
  WorkOS,
  AuthenticationResponse as WorkOSAuthenticationResponse,
  DirectoryUser as WorkOSDirectoryUser,
  User as WorkOSUser,
} from "@workos-inc/node";
import { sealData, unsealData } from "iron-session";
import type {
  GetServerSidePropsContext,
  NextApiRequest,
  NextApiResponse,
} from "next";

export type SessionCookie = {
  sessionData: string;
  organizationId?: string;
  authenticationMethod: WorkOSAuthenticationResponse["authenticationMethod"];
  region: RegionType;
  workspaceId: string;
};

export function getUserNicknameFromEmail(email: string) {
  return email.split("@")[0] ?? "";
}

export async function getWorkOSSession(
  req: NextApiRequest | GetServerSidePropsContext["req"],
  res: NextApiResponse | GetServerSidePropsContext["res"]
): Promise<SessionWithUser | undefined> {
  const workOSSessionCookie = req.cookies["workos_session"];
  if (workOSSessionCookie) {
    const result = await getWorkOSSessionFromCookie(workOSSessionCookie);
    const domain = config.getWorkOSSessionCookieDomain();
    // In development (localhost), omit Secure flag as it requires HTTPS
    // Safari strictly enforces this and will not set cookies with Secure flag on HTTP
    const secureFlag = isDevelopment() ? "" : "; Secure";
    if (result.cookie === "") {
      if (domain) {
        res.setHeader("Set-Cookie", [
          `workos_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly${secureFlag}; SameSite=Lax`,
          `workos_session=; Domain=${domain}; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly${secureFlag}; SameSite=Lax`,
        ]);
      } else {
        res.setHeader("Set-Cookie", [
          `workos_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly${secureFlag}; SameSite=Lax`,
        ]);
      }
    } else if (result.cookie) {
      if (domain) {
        res.setHeader("Set-Cookie", [
          `workos_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly${secureFlag}; SameSite=Lax`,
          `workos_session=${result.cookie}; Domain=${domain}; Path=/; HttpOnly${secureFlag}; SameSite=Lax; Max-Age=2592000`,
        ]);
      } else {
        res.setHeader("Set-Cookie", [
          `workos_session=${result.cookie}; Path=/; HttpOnly${secureFlag}; SameSite=Lax; Max-Age=2592000`,
        ]);
      }
    }

    return result.session;
  }

  return undefined;
}

export async function _getRefreshedCookie(
  workOSSessionCookie: string,
  session: ReturnType<WorkOS["userManagement"]["loadSealedSession"]>,
  organizationId: string | undefined,
  authenticationMethod: string | undefined,
  workspaceId: string | undefined,
  region: RegionType
): Promise<string | null> {
  const r = await session.refresh({
    cookiePassword: config.getWorkOSCookiePassword(),
  });
  if (r.authenticated) {
    // Update the session cookie with new session data
    const sealedCookie = await sealData(
      {
        sessionData: r.sealedSession,
        organizationId,
        authenticationMethod,
        region,
        workspaceId,
      },
      {
        password: config.getWorkOSCookiePassword(),
        ttl: 0,
      }
    );
    return sealedCookie;
  }
  return null;
}

const getRefreshedCookie = cacheWithRedis(
  _getRefreshedCookie,
  (workOSSessionCookie) => {
    return `workos_session_refresh:${sha256(workOSSessionCookie)}`;
  },
  {
    ttlMs: 60 * 10 * 1000,
    useDistributedLock: true,
  }
);

// Proactively refresh when less than 1 minute remains on the access token.
const PROACTIVE_REFRESH_THRESHOLD_SECONDS = 60;

function getAccessTokenExpirySeconds(accessToken: string): number | null {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1], "base64").toString()
    );
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

/**
 * Warm the getRefreshedCookie cache if the access token is close to expiry.
 * Fire-and-forget: does not block the current request.
 * When the token actually expires, the next request will find the refreshed
 * cookie already in the cache instead of blocking on a WorkOS API call.
 */
function maybeProactiveRefresh({
  accessToken,
  workOSSessionCookie,
  session,
  organizationId,
  authenticationMethod,
  workspaceId,
  region,
}: {
  accessToken: string;
  workOSSessionCookie: string;
  session: ReturnType<WorkOS["userManagement"]["loadSealedSession"]>;
  organizationId: string | undefined;
  authenticationMethod: string | undefined;
  workspaceId: string | undefined;
  region: RegionType;
}): void {
  const expSeconds = getAccessTokenExpirySeconds(accessToken);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const remainingSeconds = expSeconds ? expSeconds - nowSeconds : null;

  if (
    remainingSeconds === null ||
    remainingSeconds >= PROACTIVE_REFRESH_THRESHOLD_SECONDS
  ) {
    return;
  }

  logger.info(
    { remainingSeconds },
    "Session token close to expiry, proactively warming refresh cache"
  );

  // Fire-and-forget via the cached wrapper so the distributed lock
  // deduplicates concurrent proactive refreshes from multiple requests.
  void getRefreshedCookie(
    workOSSessionCookie,
    session,
    organizationId,
    authenticationMethod,
    workspaceId,
    region
  )
    .then((cookie) => {
      if (cookie) {
        logger.info("Proactive refresh cache warmed");
      }
    })
    .catch((err) => {
      logger.error({ err }, "Proactive refresh cache warming failed");
    });
}

export async function getWorkOSSessionFromCookie(
  workOSSessionCookie: string
): Promise<{
  cookie: string | undefined;
  session: SessionWithUser | undefined;
}> {
  const {
    sessionData,
    organizationId,
    authenticationMethod,
    workspaceId,
    region,
  } = await unsealData<SessionCookie>(workOSSessionCookie, {
    password: config.getWorkOSCookiePassword(),
  });

  if (!sessionData) {
    return {
      // Clear the cookie if unsealing fails.
      cookie: "",
      session: undefined,
    };
  }

  const session = getWorkOS().userManagement.loadSealedSession({
    sessionData,
    cookiePassword: config.getWorkOSCookiePassword(),
  });

  try {
    const r:
      | AuthenticateWithSessionCookieSuccessResponse
      | AuthenticateWithSessionCookieFailedResponse
      | RefreshSessionResponse = await session.authenticate();

    if (!r.authenticated) {
      const refreshedCookie = await getRefreshedCookie(
        workOSSessionCookie,
        session,
        organizationId,
        authenticationMethod,
        workspaceId,
        region
      );
      if (refreshedCookie) {
        const { session, cookie } =
          await getWorkOSSessionFromCookie(refreshedCookie);
        return {
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          cookie: cookie || refreshedCookie,
          session,
        };
      } else {
        return {
          cookie: workOSSessionCookie,
          session: undefined,
        };
      }
    }

    // Warm the refresh cache if close to expiry (fire-and-forget).
    maybeProactiveRefresh({
      accessToken: r.accessToken,
      workOSSessionCookie,
      session,
      organizationId,
      authenticationMethod,
      workspaceId,
      region,
    });

    return {
      cookie: undefined,
      session: {
        type: "workos" as const,
        sessionId: r.sessionId,
        region,
        user: {
          email: r.user.email,
          email_verified: r.user.emailVerified,
          name: r.user.email ?? "",
          family_name: r.user.lastName ?? "",
          given_name: r.user.firstName ?? "",
          nickname: getUserNicknameFromEmail(r.user.email) ?? "",
          workOSUserId: r.user.id,
        },
        organizationId,
        workspaceId,
        isSSO: authenticationMethod?.toLowerCase() === "sso",
        authenticationMethod,
      },
    };
  } catch (error) {
    logger.error({ error }, "Session authentication error");

    return {
      // In case WorkOS fails, do not clear the cookie.
      cookie: undefined,
      session: undefined,
    };
  }
}

export async function fetchUserFromWorkOS(
  email: string
): Promise<Result<WorkOSUser, Error>> {
  const workOSUserResponse = await getWorkOS().userManagement.listUsers({
    email,
  });

  const [workOSUser] = workOSUserResponse.data;
  if (!workOSUser) {
    return new Err(new Error(`User not found with email "${email}"`));
  }

  return new Ok(workOSUser);
}

export async function fetchUsersFromWorkOSWithEmails(emails: string[]) {
  const workOSResponses = await concurrentExecutor(
    emails,
    async (email) => getWorkOS().userManagement.listUsers({ email }),
    { concurrency: 10 }
  );

  return workOSResponses.flatMap((res) => res.data);
}

export async function addUserToWorkOSOrganization(
  workspace: LightWorkspaceType,
  workOSUser: WorkOSUser
): Promise<Result<undefined, Error>> {
  if (workspace.workOSOrganizationId) {
    await getWorkOS().userManagement.createOrganizationMembership({
      organizationId: workspace.workOSOrganizationId,
      userId: workOSUser.id,
      roleSlug: "user",
    });

    await invalidateWorkOSOrganizationsCacheForUserId(workOSUser.id);

    return new Ok(undefined);
  }
  return new Err(
    new Error("No WorkOS organization associated with this workspace")
  );
}

export async function fetchOrCreateWorkOSUserWithEmail({
  workOSUser,
  workspace,
}: {
  workspace: LightWorkspaceType;
  workOSUser: WorkOSDirectoryUser;
}): Promise<Result<WorkOSUser, Error>> {
  const localLogger = logger.child({
    directoryUserId: workOSUser.id,
    workspaceId: workspace.sId,
  });

  let email = workOSUser.email;
  if (!email) {
    email =
      workOSUser.rawAttributes.emails.find(
        (e: unknown): e is { address: string; primary: true } =>
          typeof e === "object" &&
          e !== null &&
          "primary" in e &&
          e.primary === true &&
          "address" in e &&
          isString(e.address)
      )?.address ?? null;
    if (!email) {
      return new Err(new Error("Missing email"));
    }
  }

  const workOSUserResponse = await getWorkOS().userManagement.listUsers({
    email,
  });

  const [existingUser] = workOSUserResponse.data;
  if (!existingUser) {
    const createdUser = await getWorkOS().userManagement.createUser({
      email,
      firstName: workOSUser.firstName ?? undefined,
      lastName: workOSUser.lastName ?? undefined,
      metadata: {
        region: multiRegionsConfig.getCurrentRegion(),
      },
    });
    localLogger.info(
      { workOSUserId: createdUser.id },
      "Created WorkOS user for webhook event."
    );

    const addUserToOrganizationResult = await addUserToWorkOSOrganization(
      workspace,
      createdUser
    );

    if (addUserToOrganizationResult.isOk()) {
      localLogger.info(
        {
          workOSUserId: createdUser.id,
          organizationId: workspace.workOSOrganizationId,
        },
        "Added user to the organization."
      );
    } else {
      localLogger.error(
        { workOSUserId: createdUser.id },
        `Created a user but could not add it to the organization: ${addUserToOrganizationResult.error.message}.`
      );
    }

    return new Ok(createdUser);
  }

  localLogger.info("Found WorkOS user for webhook event.");

  return new Ok(existingUser);
}
