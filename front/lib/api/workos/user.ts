import type {
  AuthenticateWithSessionCookieFailedResponse,
  AuthenticateWithSessionCookieSuccessResponse,
  AuthenticationResponse as WorkOSAuthenticationResponse,
  DirectoryUser as WorkOSDirectoryUser,
  RefreshSessionResponse,
  User as WorkOSUser,
  WorkOS,
} from "@workos-inc/node";
import { sealData, unsealData } from "iron-session";
import type {
  GetServerSidePropsContext,
  NextApiRequest,
  NextApiResponse,
} from "next";

import config from "@app/lib/api/config";
import type { RegionType } from "@app/lib/api/regions/config";
import { config as multiRegionsConfig } from "@app/lib/api/regions/config";
import { getWorkOS } from "@app/lib/api/workos/client";
import { invalidateWorkOSOrganizationsCacheForUserId } from "@app/lib/api/workos/organization_membership";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { cacheWithRedis } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import type { LightWorkspaceType, Result } from "@app/types";
import { Err, Ok, sha256 } from "@app/types";

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
    if (result.cookie === "") {
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
    } else if (result.cookie) {
      if (domain) {
        res.setHeader("Set-Cookie", [
          "workos_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax",
          `workos_session=${result.cookie}; Domain=${domain}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
        ]);
      } else {
        res.setHeader("Set-Cookie", [
          `workos_session=${result.cookie}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
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
        // Send the new cookie
        return {
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          cookie: cookie || refreshedCookie,
          session,
        };
      } else {
        return {
          // Return the previous cookie in case it fails.
          cookie: workOSSessionCookie,
          session: undefined,
        };
      }
    }

    // Session is still valid, return without resetting the cookie
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
          auth0Sub: null,
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
      cookie: "",
      session: undefined,
    };
  }
}

// Store the region in the user's app_metadata to redirect to the right region.
// A JWT Template includes this metadata in https://dust.tt/region (https://dashboard.workos.com/environment_01JGCT54YDGZAAD731M0GQKZGM/authentication/edit-jwt-template)
export async function setRegionForUser(user: WorkOSUser, region: RegionType) {
  // Update user metadata
  await getWorkOS().userManagement.updateUser({
    userId: user.id,
    metadata: {
      region,
    },
  });
}

export async function updateUserFromAuth0(
  session: SessionWithUser,
  region: RegionType,
  emailVerified: boolean
) {
  if (session.user.workOSUserId) {
    // Update user metadata
    await getWorkOS().userManagement.updateUser({
      userId: session.user.workOSUserId,
      emailVerified,
      metadata: {
        region,
      },
    });
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

  if (workOSUser.email == null) {
    return new Err(new Error("Missing email"));
  }

  const workOSUserResponse = await getWorkOS().userManagement.listUsers({
    email: workOSUser.email,
  });

  const [existingUser] = workOSUserResponse.data;
  if (!existingUser) {
    const createdUser = await getWorkOS().userManagement.createUser({
      email: workOSUser.email,
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
