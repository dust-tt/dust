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
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { LightWorkspaceType, Result } from "@app/types";
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
        isSSO: authenticationMethod?.toLowerCase() === "sso",
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
    });
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
