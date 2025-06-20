import type {
  AuthenticateWithSessionCookieFailedResponse,
  AuthenticateWithSessionCookieSuccessResponse,
  AuthenticationResponse as WorkOSAuthenticationResponse,
  DirectoryUser as WorkOSDirectoryUser,
  RefreshSessionResponse,
  User as WorkOSUser,
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
import type { SessionWithUser } from "@app/lib/iam/provider";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

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
      let r:
        | AuthenticateWithSessionCookieSuccessResponse
        | AuthenticateWithSessionCookieFailedResponse
        | RefreshSessionResponse = await session.authenticate();

      if (!r.authenticated) {
        // If authentication fails, try to refresh the session
        r = await session.refresh({
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

          // Set the new cookie
          res.setHeader("Set-Cookie", [
            `workos_session=${sealedCookie}; Path=/; HttpOnly; Secure;SameSite=Lax; Max-Age=86400`,
            `sessionType=workos; Path=/; Secure;SameSite=Lax; Max-Age=86400`,
          ]);
        } else {
          return undefined;
        }
      }

      return {
        type: "workos" as const,
        sessionId: r.sessionId,
        user: {
          email: r.user.email,
          email_verified: r.user.emailVerified,
          name: r.user.email ?? "",
          nickname: getUserNicknameFromEmail(r.user.email) ?? "",
          auth0Sub: null,
          workOSUserId: r.user.id,
        },
        // TODO(workos): Should we resolve the workspaceId and remove organizationId from here?
        organizationId,
        workspaceId,
        isSSO: authenticationMethod === "SSO",
        authenticationMethod,
      };
    } catch (error) {
      logger.error({ error }, "Session authentication error");
      return undefined;
    }
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

export async function fetchOrCreateWorkOSUserWithEmail(
  workOSUser: WorkOSDirectoryUser
): Promise<Result<WorkOSUser, Error>> {
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
    logger.info(
      { workOSUser, createdUser: existingUser, email: workOSUser.email },
      "Created WorkOS user for webhook event"
    );

    return new Ok(createdUser);
  }
  logger.info(
    { workOSUser, createdUser: existingUser, email: workOSUser.email },
    "Found WorkOS user for webhook event"
  );

  return new Ok(existingUser);
}
