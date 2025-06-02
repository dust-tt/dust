import type { Directory as WorkOSDirectory } from "@workos-inc/node";
import type {
  DirectoryGroup as WorkOSGroup,
  DirectoryUserWithGroups as WorkOSUserWithGroups,
} from "@workos-inc/node";

import { handleEnterpriseSignUpFlow } from "@app/lib/api/signup";
import { getWorkOS } from "@app/lib/api/workos/client";
import { getUserNicknameFromEmail } from "@app/lib/api/workos/user";
import type { Authenticator } from "@app/lib/auth";
import type { ExternalUser } from "@app/lib/iam/provider";
import { createOrUpdateUser } from "@app/lib/iam/users";
import { GroupResource } from "@app/lib/resources/group_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import type { UserType, WorkspaceType } from "@app/types";

type UserGroupMapping = {
  user: UserType;
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
      const user = await upsertUser({ workspace, workOSUser, directory });

      // Collect user-group mappings for later processing.
      if (user) {
        userGroupMappings.push({
          user: user.toJSON(),
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
  const groupToUsersMap = new Map<string, UserType[]>();

  for (const { user, workOSGroupIds } of userGroupMappings) {
    for (const workOSGroupId of workOSGroupIds) {
      if (!groupToUsersMap.has(workOSGroupId)) {
        groupToUsersMap.set(workOSGroupId, []);
      }
      groupToUsersMap.get(workOSGroupId)?.push(user);
    }
  }

  // For each group, sync its membership
  for (const [workOSGroupId, users] of groupToUsersMap.entries()) {
    await syncGroupMembershipForGroup(auth, {
      workspace,
      workOSGroupId,
      users,
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
    users,
  }: {
    workspace: WorkspaceType;
    workOSGroupId: string;
    users: UserType[];
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

  const setResult = await group.setMembers(auth, users);

  if (setResult.isErr()) {
    localLogger.error(
      { groupId: group.sId, error: setResult.error },
      "[WorkOS] Failed to sync group membership."
    );
    throw setResult.error;
  }

  localLogger.info(
    { groupId: group.sId, userCount: users.length },
    "[WorkOS] Successfully synced group membership."
  );
}

async function garbageCollectEmptyGroups(
  auth: Authenticator,
  {
    workspace,
    groupToUsersMap,
  }: {
    workspace: WorkspaceType;
    groupToUsersMap: Map<string, UserType[]>;
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
}): Promise<UserResource | null> {
  const localLogger = logger.child({
    workspaceId: workspace.sId,
    workOSUserEmail: workOSUser.email,
    workOSUserId: workOSUser.id,
    directoryId: directory.id,
  });

  localLogger.info("[WorkOS] Upserting user.");
  if (!workOSUser.email) {
    localLogger.error("[WorkOS] Cannot sync a user without an email.");
    return null;
  }

  const user = await UserResource.fetchByEmail(workOSUser.email);
  const externalUser: ExternalUser = {
    auth0Sub: null,
    email: workOSUser.email,
    email_verified: true,
    name: workOSUser.email ?? "",
    nickname: getUserNicknameFromEmail(workOSUser.email) ?? "",
    workOSUserId: workOSUser.id,
  };

  const { user: createdOrUpdatedUser } = await createOrUpdateUser({
    user,
    externalUser,
  });
  localLogger.info("[WorkOS] User successfully upserted.");

  // Create the membership.
  if (createdOrUpdatedUser && workspace.workOSOrganizationId) {
    await handleEnterpriseSignUpFlow(
      createdOrUpdatedUser,
      workspace.workOSOrganizationId
    );
  }

  return createdOrUpdatedUser;
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
