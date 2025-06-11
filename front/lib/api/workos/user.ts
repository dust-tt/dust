import type {
  AuthenticationResponse as WorkOSAuthenticationResponse,
  User as WorkOSUser,
} from "@workos-inc/node";
import { unsealData } from "iron-session";
import type { GetServerSidePropsContext, NextApiRequest } from "next";

import config from "@app/lib/api/config";
import type { RegionType } from "@app/lib/api/regions/config";
import { getWorkOS } from "@app/lib/api/workos/client";
import type { SessionWithUser } from "@app/lib/iam/provider";
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
  req: NextApiRequest | GetServerSidePropsContext["req"]
): Promise<SessionWithUser | undefined> {
  const workOSSessionCookie = req.cookies["workos_session"];
  if (workOSSessionCookie) {
    const { sessionData, organizationId, authenticationMethod, workspaceId } =
      await unsealData<SessionCookie>(workOSSessionCookie, {
        password: config.getWorkOSCookiePassword(),
      });

    const session = getWorkOS().userManagement.loadSealedSession({
      sessionData,
      cookiePassword: config.getWorkOSCookiePassword(),
    });

    const r = await session.authenticate();

    if (!r.authenticated) {
      return undefined;
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

export async function fetchWorkOSUserWithEmail(
  workspace: LightWorkspaceType,
  email?: string | null
): Promise<Result<WorkOSUser, Error>> {
  if (email == null) {
    return new Err(new Error("Missing email"));
  }

  const workOSUserResponse = await getWorkOS().userManagement.listUsers({
    organizationId: workspace.workOSOrganizationId ?? undefined,
    email,
  });

  const [workOSUser] = workOSUserResponse.data;
  if (!workOSUser) {
    return new Err(
      new Error(
        `User not found with email "${email}" in workOS for workspace "${workspace.sId}"`
      )
    );
  }

  return new Ok(workOSUser);
}
