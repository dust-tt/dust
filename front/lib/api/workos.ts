import type { User } from "@workos-inc/node";
import { WorkOS } from "@workos-inc/node";

import config from "@app/lib/api/config";

import type { RegionType } from "./regions/config";

import type { DirectoryGroup, DirectoryUserWithGroups } from "@workOS-inc/node";
import { WorkOS } from "@workOS-inc/node";

import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import type { WorkspaceType } from "@app/types";


let workos: WorkOS | null = null;

export function getWorkOS() {
  if (!workos) {
    workos = new WorkOS(config.getWorkOSApiKey(), {
      clientId: config.getWorkOSClientId(),
    });
  }

  return workos;
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

function getWorkOSClient(): WorkOS {
  return new WorkOS(config.getWorkOSApiKey());
}

export async function performFullSync(workspace: WorkspaceType): Promise<void> {
  logger.info(
    { workspace: workspace.sId },
    "Starting WorkOS full directory sync"
  );

  if (!workspace?.workOSOrganizationId) {
    throw new Error("WorkOS organization not configured");
  }

  const workOS = getWorkOSClient();

  const directory = await workOS.directorySync.getDirectory(
    workspace.workOSOrganizationId
  );
  if (!directory) {
    throw new Error("WorkOS directory not found");
  }

  await syncAllUsers(workspace, directory.id);

  await syncAllGroups(workspace, directory.id);

  logger.info(
    { workspaceId: workspace.sId, directoryId: directory.id },
    "WorkOS full directory sync completed successfully"
  );
}

async function syncAllUsers(
  workspace: WorkspaceType,
  directoryId: string
): Promise<void> {
  logger.info(
    { workspaceId: workspace.sId, directoryId },
    "Starting user sync"
  );

  const workOs = getWorkOSClient();

  const { autoPagination } = await workOs.directorySync.listUsers({
    directory: directoryId,
  });
  const users = await autoPagination();

  for (const workOsUser of users) {
    await upsertUser(workspace, workOsUser, directoryId);
  }

  logger.info({ workspaceId: workspace.sId }, "User sync completed");
}

async function syncAllGroups(
  workspace: WorkspaceType,
  directoryId: string
): Promise<void> {
  logger.info(
    { workspaceId: workspace.sId, directoryId },
    "Starting group sync"
  );

  const workOS = getWorkOSClient();

  const { autoPagination } = await workOS.directorySync.listGroups({
    directory: directoryId,
  });
  const groups = await autoPagination();

  for (const workOSGroup of groups) {
    await upsertGroup(workspace, workOSGroup, directoryId);
  }

  logger.info({ workspaceId: workspace.sId }, "Group sync completed");
}

async function upsertUser(
  workspace: WorkspaceType,
  workOSUser: DirectoryUserWithGroups,
  directoryId: string
): Promise<void> {
  logger.info({ workspace, workOSUser, directoryId }, "Upserting user");
}

async function upsertGroup(
  workspace: WorkspaceType,
  workOSGroup: DirectoryGroup,
  directoryId: string
): Promise<void> {
  logger.info({ workspace, workOSGroup, directoryId }, "Upserting group");
}
