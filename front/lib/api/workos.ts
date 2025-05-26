import type {
  AuthenticationResponse,
  Organization,
  User,
} from "@workos-inc/node";
import { GeneratePortalLinkIntent, WorkOS } from "@workos-inc/node";
import { unsealData } from "iron-session";
import type { GetServerSidePropsContext, NextApiRequest } from "next";

import config from "@app/lib/api/config";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { WorkOSPortalIntent } from "@app/lib/types/workos";
import logger from "@app/logger/logger";
import type { Result, WorkspaceType } from "@app/types";
import { Err, Ok } from "@app/types";

import type { RegionType } from "./regions/config";

let workos: WorkOS | null = null;

export type SessionCookie = {
  sessionData: string;
  organizationId?: string;
  authenticationMethod: AuthenticationResponse["authenticationMethod"];
  region: RegionType;
  workspaceId: string;
};

export function getWorkOS() {
  if (!workos) {
    workos = new WorkOS(config.getWorkOSApiKey(), {
      clientId: config.getWorkOSClientId(),
    });
  }

  return workos;
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
        sid: r.user.id,
        email: r.user.email,
        email_verified: r.user.emailVerified,
        name: r.user.email ?? "",
        nickname: r.user.lastName ?? "",
        sub: r.user.id,
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
// A JWT Template include this metadta in https://dust.tt/region ( https://dashboard.workos.com/environment_01JGCT54YDGZAAD731M0GQKZGM/authentication/edit-jwt-template )
export async function setRegionForUser(user: User, region: RegionType) {
  // Update user metadata
  await getWorkOS().userManagement.updateUser({
    userId: user.id,
    metadata: {
      region,
    },
  });
}

export function createWorkOSOrganization({
  workspace,
}: {
  workspace: WorkspaceType;
}): Result<Promise<Organization>, Error> {
  if (workspace.workOSOrganizationId) {
    return new Err(
      new Error("A WorkOS organization already exists for this workspace.")
    );
  }

  try {
    const organization = getWorkOS().organizations.createOrganization({
      name: workspace.name,
      metadata: { workspaceSId: workspace.sId },
    });

    return new Ok(organization);
  } catch (error) {
    logger.error(error, "Failed to create WorkOS organization");
    return new Err(new Error("Failed to create WorkOS organization"));
  }
}

// Mapping WorkOSPortalIntent to GeneratePortalLinkIntent,
// as we can't use the WorkOSPortalIntent enum on any Client-Side code.
const INTENT_MAP: Record<WorkOSPortalIntent, GeneratePortalLinkIntent> = {
  [WorkOSPortalIntent.SSO]: GeneratePortalLinkIntent.SSO,
  [WorkOSPortalIntent.DSync]: GeneratePortalLinkIntent.DSync,
  [WorkOSPortalIntent.DomainVerification]:
    GeneratePortalLinkIntent.DomainVerification,
  [WorkOSPortalIntent.AuditLogs]: GeneratePortalLinkIntent.AuditLogs,
  [WorkOSPortalIntent.LogStreams]: GeneratePortalLinkIntent.LogStreams,
  [WorkOSPortalIntent.CertificateRenewal]:
    GeneratePortalLinkIntent.CertificateRenewal,
};

export function generateWorkOSAdminPortalUrl({
  organization,
  workOSIntent,
  returnUrl,
}: {
  organization: string;
  workOSIntent: WorkOSPortalIntent;
  returnUrl: string;
}) {
  const intent = INTENT_MAP[workOSIntent];

  if (!intent) {
    throw new Error(`Invalid intent: ${workOSIntent}`);
  }

  return getWorkOS().portal.generateLink({
    organization,
    intent,
    returnUrl,
  });
}
