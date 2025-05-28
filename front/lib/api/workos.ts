import type {
  AuthenticationResponse as WorkOSAuthenticationResponse,
  Directory as WorkOSDirectory,
  DirectoryGroup as WorkOSGroup,
  DirectoryUserWithGroups as WorkOSUserWithGroups,
  Organization as WorkOSOrganization,
  User as WorkOSUser,
} from "@workos-inc/node";
import { GeneratePortalLinkIntent, WorkOS } from "@workos-inc/node";
import { unsealData } from "iron-session";
import type { GetServerSidePropsContext, NextApiRequest } from "next";

import config from "@app/lib/api/config";
import type { RegionType } from "@app/lib/api/regions/config";
import type { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { createOrUpdateUser } from "@app/lib/iam/users";
import { GroupResource } from "@app/lib/resources/group_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkOSPortalIntent } from "@app/lib/types/workos";
import logger from "@app/logger/logger";
import type { Result, WorkspaceType } from "@app/types";
import { Err, Ok } from "@app/types";

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

type UserGroupMapping = {
  workOSUserId: string;
  workOSGroupIds: string[];
};

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

    const userGroupMappings = await syncAllUsers({ workspace, directory });

    await syncAllGroups(auth, { workspace, directory });

    await syncGroupMemberships(auth, {
      workspace,
      directory,
      userGroupMappings,
    });

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
}): Promise<UserGroupMapping[]> {
  const workOS = getWorkOS();

  const userGroupMappings: UserGroupMapping[] = [];
  let nextPageCursor: string | undefined = undefined;

  do {
    const {
      data,
      listMetadata: { after },
    } = await workOS.directorySync.listUsers({
      directory: directory.id,
      after: nextPageCursor,
    });

    nextPageCursor = after as string | undefined; // Issue with the typing in the SDK.

    for (const workOSUser of data) {
      await upsertUser({ workspace, workOSUser, directory });

      // Collect user-group mappings for later processing.
      if (workOSUser.email) {
        userGroupMappings.push({
          workOSUserId: workOSUser.id,
          workOSGroupIds: workOSUser.groups.map((group) => group.id),
        });
      }
    }
  } while (nextPageCursor);

  return userGroupMappings;
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
): Promise<WorkOSGroup[]> {
  const workOS = getWorkOS();

  const groups: WorkOSGroup[] = [];
  let nextPageCursor: string | undefined = undefined;

  do {
    const {
      data,
      listMetadata: { after },
    } = await workOS.directorySync.listGroups({
      directory: directory.id,
      after: nextPageCursor,
    });

    nextPageCursor = after;
    groups.push(...data);

    for (const workOSGroup of data) {
      await upsertGroup(auth, { workspace, workOSGroup, directory });
    }
  } while (nextPageCursor);

  return groups;
}

async function syncGroupMemberships(
  auth: Authenticator,
  {
    workspace,
    directory,
    userGroupMappings,
  }: {
    workspace: WorkspaceType;
    directory: WorkOSDirectory;
    userGroupMappings: UserGroupMapping[];
  }
): Promise<void> {
  const localLogger = logger.child({
    workspaceId: workspace.sId,
    directoryId: directory.id,
  });

  localLogger.info("[WorkOS] Starting group memberships sync.");

  // Build a map of the WorkOS group ID to the list of user IDs.
  const groupToUsersMap = new Map<string, string[]>();

  for (const { workOSUserId, workOSGroupIds } of userGroupMappings) {
    for (const workOSGroupId of workOSGroupIds) {
      if (!groupToUsersMap.has(workOSGroupId)) {
        groupToUsersMap.set(workOSGroupId, []);
      }
      groupToUsersMap.get(workOSGroupId)?.push(workOSUserId);
    }
  }

  // For each group, sync its membership
  for (const [workOSGroupId, userEmails] of groupToUsersMap.entries()) {
    await syncGroupMembershipForGroup(auth, {
      workspace,
      workOSGroupId,
      userEmails,
    });
  }

  // Also handle groups that have no members in WorkOS (should be emptied)
  await garbageCollectEmptyGroups(auth, { workspace, groupToUsersMap });

  localLogger.info("[WorkOS] Group memberships sync completed.");
}

async function syncGroupMembershipForGroup(
  auth: Authenticator,
  {
    workspace,
    workOSGroupId,
    userEmails,
  }: {
    workspace: WorkspaceType;
    workOSGroupId: string;
    userEmails: string[];
  }
): Promise<void> {
  const localLogger = logger.child({
    workspaceId: workspace.sId,
    workOSGroupId,
  });

  // Find the group by WorkOS group ID.
  const group = await GroupResource.fetchByWorkOSGroupId(auth, workOSGroupId);
  if (!group) {
    localLogger.warn(
      "[WorkOS] Group not found for WorkOS group ID, skipping membership sync."
    );
    return;
  }

  // Find all users by email.
  const users: UserResource[] = [];
  for (const userEmail of userEmails) {
    const user = await UserResource.fetchByEmail(userEmail);
    if (user) {
      users.push(user);
    } else {
      localLogger.warn(
        { userEmail },
        "[WorkOS] User not found for group membership sync."
      );
    }
  }

  const setResult = await group.setMembers(
    auth,
    users.map((user) => user.toJSON())
  );
  if (setResult.isOk()) {
    localLogger.info(
      { groupId: group.sId, userCount: users.length },
      "[WorkOS] Successfully synced group membership."
    );
  } else {
    localLogger.error(
      { groupId: group.sId, error: setResult.error },
      "[WorkOS] Failed to sync group membership."
    );
  }
}

async function garbageCollectEmptyGroups(
  auth: Authenticator,
  {
    workspace,
    groupToUsersMap,
  }: {
    workspace: WorkspaceType;
    groupToUsersMap: Map<string, string[]>;
  }
): Promise<void> {
  const allGroups = await GroupResource.listAllWorkspaceGroups(auth, {
    groupKinds: ["provisioned"],
  });

  // Find groups that have WorkOS IDs but are not in our current sync data.
  for (const group of allGroups) {
    if (group.workOSGroupId && !groupToUsersMap.has(group.workOSGroupId)) {
      // This group exists in our DB but has no members in WorkOS, so we empty it.
      const setResult = await group.setMembers(auth, []);

      if (setResult.isErr()) {
        logger.error(
          {
            workspaceId: workspace.sId,
            groupId: group.sId,
            workOSGroupId: group.workOSGroupId,
            error: setResult.error,
          },
          "[WorkOS] Failed to empty group with no WorkOS members."
        );
        throw setResult.error;
      }
      logger.info(
        {
          workspaceId: workspace.sId,
          groupId: group.sId,
          workOSGroupId: group.workOSGroupId,
        },
        "[WorkOS] Emptied group with no WorkOS members."
      );
    }
  }
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
  const externalUser = {
    sid: workOSUser.id,
    email: workOSUser.email,
    email_verified: true,
    name: workOSUser.email ?? "",
    nickname: getUserNicknameFromEmail(workOSUser.email) ?? "",
    sub: workOSUser.id,
  };

  await createOrUpdateUser({
    platform: "workos",
    user,
    externalUser,
  });
  localLogger.info("[WorkOS] User successfully upserted.");
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
    workOSGroupName: workOSGroup.name,
    directoryId: directory.id,
  });

  localLogger.info("[WorkOS] Upserting group");

  const group = await GroupResource.fetchByWorkOSGroupId(auth, workOSGroup.id);

  if (!group) {
    const { success } = await GroupResource.makeNewProvisionedGroup(auth, {
      workspace,
      workOSGroup,
    });
    if (!success) {
      localLogger.error("[WorkOS] Failed to create group.");
      return;
    }
    localLogger.info("[WorkOS] Group successfully created.");
  }
}
