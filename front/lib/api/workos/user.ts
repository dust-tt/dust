import config from "@app/lib/api/config";
import { getRedisCacheClient } from "@app/lib/api/redis";
import { config as multiRegionsConfig } from "@app/lib/api/regions/config";
import { getWorkOS, getWorkOSForSessionAuth } from "@app/lib/api/workos/client";
import { invalidateWorkOSOrganizationsCacheForUserId } from "@app/lib/api/workos/organization_membership";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { cacheWithRedis } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import tracer from "@app/logger/tracer";
import type { RegionType } from "@app/types/region";
import { isDevelopment } from "@app/types/shared/env";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { sha256 } from "@app/types/shared/utils/encryption";
import { isString } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";
import type {
  WorkOS,
  AuthenticationResponse as WorkOSAuthenticationResponse,
  DirectoryUser as WorkOSDirectoryUser,
  User as WorkOSUser,
} from "@workos-inc/node";
import { sealData, unsealData } from "iron-session";

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

// Framework-agnostic session resolver: takes the raw cookie value and returns
// the session along with any Set-Cookie header values that should be added to
// the response. Used by Hono middlewares.
export async function getWorkOSSessionWithSetCookies(
  workOSSessionCookie: string | undefined
): Promise<{
  session: SessionWithUser | undefined;
  setCookies: string[];
}> {
  if (!workOSSessionCookie) {
    return { session: undefined, setCookies: [] };
  }

  const result = await getWorkOSSessionFromCookie(workOSSessionCookie);
  const domain = config.getWorkOSSessionCookieDomain();
  // In development (localhost), omit Secure flag as it requires HTTPS
  // Safari strictly enforces this and will not set cookies with Secure flag on HTTP
  const secureFlag = isDevelopment() ? "" : "; Secure";

  let setCookies: string[] = [];
  if (result.cookie === "") {
    setCookies = domain
      ? [
          `workos_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly${secureFlag}; SameSite=Lax`,
          `workos_session=; Domain=${domain}; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly${secureFlag}; SameSite=Lax`,
        ]
      : [
          `workos_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly${secureFlag}; SameSite=Lax`,
        ];
  } else if (result.cookie) {
    setCookies = domain
      ? [
          `workos_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly${secureFlag}; SameSite=Lax`,
          `workos_session=${result.cookie}; Domain=${domain}; Path=/; HttpOnly${secureFlag}; SameSite=Lax; Max-Age=2592000`,
        ]
      : [
          `workos_session=${result.cookie}; Path=/; HttpOnly${secureFlag}; SameSite=Lax; Max-Age=2592000`,
        ];
  }

  return { session: result.session, setCookies };
}

// Global (not per-session) circuit breaker: once a refresh call fails
// unexpectedly (WorkOS unreachable), skip attempting refresh entirely for a
// cooldown instead of every request paying for its own failed attempt.
const WORKOS_REFRESH_CIRCUIT_BREAKER_KEY = "workos_refresh_circuit_breaker";
const WORKOS_REFRESH_CIRCUIT_BREAKER_COOLDOWN_MS = 60 * 1000;

class WorkOSRefreshCircuitOpenError extends Error {
  constructor() {
    super("Skipping WorkOS refresh: circuit breaker is open");
  }
}

async function isWorkOSRefreshCircuitOpen(): Promise<boolean> {
  const redisCli = await getRedisCacheClient({ origin: "cache_with_redis" });
  return (await redisCli.get(WORKOS_REFRESH_CIRCUIT_BREAKER_KEY)) !== null;
}

async function openWorkOSRefreshCircuit(): Promise<void> {
  const redisCli = await getRedisCacheClient({ origin: "cache_with_redis" });
  await redisCli.set(WORKOS_REFRESH_CIRCUIT_BREAKER_KEY, "1", {
    PX: WORKOS_REFRESH_CIRCUIT_BREAKER_COOLDOWN_MS,
  });
}

export async function _getRefreshedCookie(
  workOSSessionCookie: string,
  session: ReturnType<WorkOS["userManagement"]["loadSealedSession"]>,
  organizationId: string | undefined,
  authenticationMethod: string | undefined,
  workspaceId: string | undefined,
  region: RegionType
): Promise<string | null> {
  if (await isWorkOSRefreshCircuitOpen()) {
    throw new WorkOSRefreshCircuitOpenError();
  }

  let r;
  try {
    r = await session.refresh({
      cookiePassword: config.getWorkOSCookiePassword(),
    });
  } catch (error) {
    // Any error reaching here is already not one of the WorkOS-side session
    // rejections (invalid grant, MFA required, SSO required): those are
    // returned by `session.refresh()` as a clean `{ authenticated: false }`
    // and never throw. So this is always an unexpected/transient failure.
    await openWorkOSRefreshCircuit();
    throw error;
  }

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

const refreshCookieKeyResolver = (workOSSessionCookie: string) =>
  `workos_session_refresh:${sha256(workOSSessionCookie)}`;
const refreshCookieOptions = {
  ttlMs: 60 * 10 * 1000,
  useDistributedLock: true as const,
};

const getRefreshedCookie = cacheWithRedis(
  _getRefreshedCookie,
  refreshCookieKeyResolver,
  refreshCookieOptions
);

// Same cache key and function, but returns null immediately if the lock is
// taken instead of spin-waiting. Used for proactive refresh where only one
// request should do the work.
const getRefreshedCookieSkipIfLocked = cacheWithRedis(
  _getRefreshedCookie,
  refreshCookieKeyResolver,
  {
    ...refreshCookieOptions,
    skipIfLocked: true,
  }
);

// Proactively refresh when less than 1 minute remains on the access token.
const PROACTIVE_REFRESH_THRESHOLD_SECONDS = 60;

function decodeAccessTokenPayload(
  accessToken: string
): Record<string, unknown> | null {
  try {
    return JSON.parse(
      Buffer.from(accessToken.split(".")[1], "base64").toString()
    );
  } catch {
    return null;
  }
}

function getAccessTokenExpirySeconds(accessToken: string): number | null {
  const payload = decodeAccessTokenPayload(accessToken);
  return typeof payload?.exp === "number" ? payload.exp : null;
}

/**
 * Proactively refresh the session cookie if the access token is close to expiry.
 * Uses skipIfLocked: only one request does the refresh, others return null
 * immediately (no blocking). The refreshing request returns the new cookie
 * so the browser gets it via Set-Cookie.
 */
async function maybeProactiveRefresh({
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
}): Promise<string | null> {
  const expSeconds = getAccessTokenExpirySeconds(accessToken);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const remainingSeconds = expSeconds ? expSeconds - nowSeconds : null;

  if (
    remainingSeconds === null ||
    remainingSeconds >= PROACTIVE_REFRESH_THRESHOLD_SECONDS
  ) {
    return null;
  }

  // Returns null immediately if another request is already refreshing.
  // Only the lock winner does the WorkOS call and returns the new cookie
  // to send to the browser.
  return getRefreshedCookieSkipIfLocked(
    workOSSessionCookie,
    session,
    organizationId,
    authenticationMethod,
    workspaceId,
    region
  );
}

// How far past access-token expiry we'll still accept a session when WorkOS
// is unreachable. Bounded on purpose: this session was never re-vouched for
// by WorkOS during this window, so it must stay short.
const DEGRADED_MODE_AUTH_GRACE_SECONDS = 30 * 60;

/**
 * Fallback used when `session.authenticate()` / `session.refresh()` threw
 * (WorkOS unreachable) rather than returning a clean "not authenticated"
 * (revoked/invalid-grant sessions never reach this path, see the `refresh()`
 * catch above them). Accepts the session cookie we ourselves sealed with
 * `WORKOS_COOKIE_PASSWORD` without asking WorkOS to re-vouch for it, as long
 * as its access token expired only recently. Never extends or refreshes the
 * cookie; the caller falls back to a normal refresh on the next request.
 */
async function getDegradedModeSession({
  sessionData,
  organizationId,
  authenticationMethod,
  workspaceId,
}: {
  sessionData: string;
  organizationId: string | undefined;
  authenticationMethod: string | undefined;
  workspaceId: string;
}): Promise<SessionWithUser | null> {
  let inner: { accessToken?: string; user?: WorkOSUser };
  try {
    inner = await unsealData(sessionData, {
      password: config.getWorkOSCookiePassword(),
    });
  } catch {
    return null;
  }

  const { accessToken, user } = inner;
  if (!accessToken || !user) {
    return null;
  }

  const expSeconds = getAccessTokenExpirySeconds(accessToken);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const secondsPastExpiry = expSeconds ? nowSeconds - expSeconds : null;

  if (
    secondsPastExpiry === null ||
    secondsPastExpiry > DEGRADED_MODE_AUTH_GRACE_SECONDS
  ) {
    return null;
  }

  const claims = decodeAccessTokenPayload(accessToken);
  const sessionId = isString(claims?.sid) ? claims.sid : null;
  if (!sessionId) {
    return null;
  }

  logger.error(
    { workspaceId, workOSUserId: user.id, secondsPastExpiry },
    "WorkOS unreachable: accepting expired session under degraded-mode auth grace period"
  );

  return {
    type: "workos" as const,
    sessionId,
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
    workspaceId,
    isSSO: authenticationMethod?.toLowerCase() === "sso",
    authenticationMethod,
  };
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

  const session = getWorkOSForSessionAuth().userManagement.loadSealedSession({
    sessionData,
    cookiePassword: config.getWorkOSCookiePassword(),
  });

  try {
    const r = await tracer.trace("workos.session.authenticate", () =>
      session.authenticate()
    );

    if (!r.authenticated) {
      const refreshedCookie = await tracer.trace("workos.session.refresh", () =>
        getRefreshedCookie(
          workOSSessionCookie,
          session,
          organizationId,
          authenticationMethod,
          workspaceId,
          region
        )
      );
      if (refreshedCookie) {
        const { session, cookie } =
          await getWorkOSSessionFromCookie(refreshedCookie);

        logger.info(
          { workspaceId, workOSUserId: session?.user?.workOSUserId },
          "Session expired, refreshed cookie"
        );

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

    // Proactively refresh if close to expiry. Only one request does the
    // actual refresh (others get null immediately). The refreshing request
    // returns the new cookie so the browser updates before the token expires.
    const proactiveRefreshedCookie = await tracer.trace(
      "workos.session.proactiveRefresh",
      () =>
        maybeProactiveRefresh({
          accessToken: r.accessToken,
          workOSSessionCookie,
          session,
          organizationId,
          authenticationMethod,
          workspaceId,
          region,
        })
    );

    if (proactiveRefreshedCookie) {
      logger.info(
        { workspaceId, workOSUserId: r.user.id },
        "Session close to expiry, proactively refreshed cookie"
      );
    }

    return {
      cookie: proactiveRefreshedCookie ?? undefined,
      session: {
        type: "workos" as const,
        sessionId: r.sessionId,
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
    const degradedSession = await getDegradedModeSession({
      sessionData,
      organizationId,
      authenticationMethod,
      workspaceId,
    });

    logger.error(
      { error, workspaceId, degradedModeAuthApplied: degradedSession !== null },
      "Session authentication error"
    );

    return {
      // In case WorkOS fails, do not clear the cookie.
      cookie: undefined,
      session: degradedSession ?? undefined,
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

function getEmailFromWorkOSDirectoryUser(
  workOSUser: WorkOSDirectoryUser
): string | null {
  if (workOSUser.email) {
    return workOSUser.email;
  }

  return (
    workOSUser.rawAttributes.emails.find(
      (e: unknown): e is { address: string; primary: true } =>
        typeof e === "object" &&
        e !== null &&
        "primary" in e &&
        e.primary === true &&
        "address" in e &&
        isString(e.address)
    )?.address ?? null
  );
}

async function fetchWorkOSUserByEmail(email: string) {
  const workOSUserResponse = await getWorkOS().userManagement.listUsers({
    email,
  });

  const [existingUser] = workOSUserResponse.data;

  return existingUser ?? null;
}

/**
 * Fetch-only counterpart of `fetchOrCreateWorkOSUserWithEmail`. Deprovisioning
 * paths must use this one: creating a WorkOS user while handling a removal
 * provisions the very user we are removing.
 */
export async function fetchWorkOSUserWithEmail({
  workOSUser,
  workspace,
}: {
  workspace: LightWorkspaceType;
  workOSUser: WorkOSDirectoryUser;
}): Promise<Result<WorkOSUser | null, Error>> {
  const localLogger = logger.child({
    directoryUserId: workOSUser.id,
    workspaceId: workspace.sId,
  });

  const email = getEmailFromWorkOSDirectoryUser(workOSUser);
  if (!email) {
    return new Err(new Error("Missing email"));
  }

  const existingUser = await fetchWorkOSUserByEmail(email);
  if (!existingUser) {
    return new Ok(null);
  }

  localLogger.info("Found WorkOS user for webhook event.");

  return new Ok(existingUser);
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

  const email = getEmailFromWorkOSDirectoryUser(workOSUser);
  if (!email) {
    return new Err(new Error("Missing email"));
  }

  const existingUser = await fetchWorkOSUserByEmail(email);
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
