import type {
  AuthenticationResponse as WorkOSAuthenticationResponse,
  Directory as WorkOSDirectory,
  Organization as WorkOSOrganization,
  User as WorkOSUser,
} from "@workos-inc/node";
import type {
  DirectoryGroup as WorkOSGroup,
  DirectoryUserWithGroups as WorkOSUserWithGroups,
} from "@workos-inc/node";
import { GeneratePortalLinkIntent, WorkOS } from "@workos-inc/node";
import { unsealData } from "iron-session";
import type { GetServerSidePropsContext, NextApiRequest } from "next";

import config from "@app/lib/api/config";
import type { RegionType } from "@app/lib/api/regions/config";
import type { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { GroupResource } from "@app/lib/resources/group_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkOSPortalIntent } from "@app/lib/types/workos";
import logger from "@app/logger/logger";
import type { Result, WorkspaceType } from "@app/types";
import { Err, Ok, sanitizeString } from "@app/types";

let workos: WorkOS | null = null;

export type SessionCookie = {
  sessionData: string;
  organizationId?: string;
  authenticationMethod: WorkOSAuthenticationResponse["authenticationMethod"];
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
        sid: r.user.id,
        email: r.user.email,
        email_verified: r.user.emailVerified,
        name: r.user.email ?? "",
        nickname: getUserNicknameFromEmail(r.user.email) ?? "",
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

export function createWorkOSOrganization({
  workspace,
}: {
  workspace: WorkspaceType;
}): Result<Promise<WorkOSOrganization>, Error> {
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

export async function syncWorkOSDirectoriesForWorkspace(
  auth: Authenticator
): Promise<void> {
  const workspace = auth.getNonNullableWorkspace();

  logger.info(
    { workspace: workspace.sId },
    "[WorkOS] Starting WorkOS full directory sync."
  );

  if (!workspace?.workOSOrganizationId) {
    throw new Error("WorkOS organization not configured.");
  }

  const workOS = getWorkOS();

  const { data: directories } = await workOS.directorySync.listDirectories({
    organizationId: workspace.workOSOrganizationId,
  });

  for (const directory of directories) {
    logger.info(
      { workspaceId: workspace.sId, directoryId: directory.id },
      "[WorkOS] Syncing directory."
    );

    await syncAllUsers({ workspace, directory });

    await syncAllGroups(auth, { workspace, directory });

    logger.info(
      { workspaceId: workspace.sId, directoryId: directory.id },
      "[WorkOS] Directory successfully synced."
    );
  }
}

async function syncAllUsers({
  workspace,
  directory,
}: {
  workspace: WorkspaceType;
  directory: WorkOSDirectory;
}): Promise<void> {
  logger.info(
    {
      workspaceId: workspace.sId,
      directoryId: directory.id,
    },
    "[WorkOS] Starting user sync."
  );

  const workOs = getWorkOS();

  // TODO(2025-05-26 aubin): paginate here.
  const { data: users } = await workOs.directorySync.listUsers({
    directory: directory.id,
  });

  for (const workOSUser of users) {
    await upsertUser({ workspace, workOSUser, directory });
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      directoryId: directory.id,
    },
    "[WorkOS] User sync completed."
  );
}

async function syncAllGroups(
  auth: Authenticator,
  {
    workspace,
    directory,
  }: {
    workspace: WorkspaceType;
    directory: WorkOSDirectory;
  }
): Promise<void> {
  logger.info(
    {
      workspaceId: workspace.sId,
      directoryId: directory.id,
    },
    "[WorkOS] Starting group sync"
  );

  const workOS = getWorkOS();

  // TODO(2025-05-26 aubin): paginate here.
  const { data: groups } = await workOS.directorySync.listGroups({
    directory: directory.id,
  });

  for (const workOSGroup of groups) {
    await upsertGroup(auth, { workspace, workOSGroup, directory });
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      directoryId: directory.id,
    },
    "[WorkOS] Group sync completed."
  );
}

async function upsertUser({
  workspace,
  directory,
  workOSUser,
}: {
  workspace: WorkspaceType;
  workOSUser: WorkOSUserWithGroups;
  directory: WorkOSDirectory;
}): Promise<void> {
  const localLogger = logger.child({
    workspaceId: workspace.sId,
    workOSUserEmail: workOSUser.email,
    workOSUserId: workOSUser.id,
    directoryId: directory.id,
  });

  localLogger.info("[WorkOS] Upserting user.");
  if (!workOSUser.email) {
    localLogger.error("[WorkOS] Cannot sync a user without an email.");
    return;
  }

  const user = await UserResource.fetchByEmail(workOSUser.email);
  if (!user) {
    await UserResource.makeNew({
      sId: generateRandomModelSId(),
      auth0Sub: null,
      provider: directory.type,
      // TODO: not sure what the providerId is here, it does not seem to be used.
      providerId: workOSUser.id,
      name: workOSUser.lastName ?? workOSUser.email,
      username: getUserNicknameFromEmail(workOSUser.email),
      email: sanitizeString(workOSUser.email),
      firstName: workOSUser.firstName ?? "",
      lastName: workOSUser.lastName ?? null,
      imageUrl: null,
    });
    localLogger.info("[WorkOS] User successfully created.");
  } else {
    localLogger.info("[WorkOS] User already exists.");
    // TODO(2025-05-26 aubin): reconciliate users here.
  }
}

async function upsertGroup(
  auth: Authenticator,
  {
    workspace,
    directory,
    workOSGroup,
  }: {
    workspace: WorkspaceType;
    workOSGroup: WorkOSGroup;
    directory: WorkOSDirectory;
  }
): Promise<void> {
  const localLogger = logger.child({
    workspaceId: workspace.sId,
    workOSGroupId: workOSGroup.id,
    directoryId: directory.id,
  });

  localLogger.info("[WorkOS] Upserting group");

  const group = await GroupResource.fetchByWorkOSGroupId(auth, workOSGroup.id);

  if (!group) {
    await GroupResource.makeNew({
      name: workOSGroup.name,
      workspaceId: workspace.id,
      workOSGroupId: workOSGroup.id,
      kind: "provisioned",
    });
    localLogger.info("[WorkOS] Group successfully created.");
  } else {
    localLogger.info("[WorkOS] Group already exists.");
  }
}
