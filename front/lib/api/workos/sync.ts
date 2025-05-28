import type { Directory as WorkOSDirectory } from "@workos-inc/node";
import type {
  DirectoryGroup as WorkOSGroup,
  DirectoryUserWithGroups as WorkOSUserWithGroups,
} from "@workos-inc/node";

import { getWorkOS } from "@app/lib/api/workos/client";
import { getUserNicknameFromEmail } from "@app/lib/api/workos/user";
import type { Authenticator } from "@app/lib/auth";
import { createOrUpdateUser } from "@app/lib/iam/users";
import { GroupResource } from "@app/lib/resources/group_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import type { WorkspaceType } from "@app/types";

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

    // TODO(2025-05-27 aubin): update group memberships.

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
