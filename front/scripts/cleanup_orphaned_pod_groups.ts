/**
 * Delete the auto-created groups left behind by the Pod deletion bug fixed in
 * https://github.com/dust-tt/tasks/issues/10245.
 *
 * Dry run:
 *   npx tsx scripts/cleanup_orphaned_pod_groups.ts \
 *     --workspaceId WORKSPACE_SID \
 *     --podName "Deleted Pod Name"
 *
 * Execute:
 *   npx tsx scripts/cleanup_orphaned_pod_groups.ts \
 *     --workspaceId WORKSPACE_SID \
 *     --podName "Deleted Pod Name" \
 *     --execute
 */
import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { makeScript } from "@app/scripts/helpers";
import {
  PROJECT_EDITOR_GROUP_PREFIX,
  PROJECT_GROUP_PREFIX,
} from "@app/types/groups";

type CleanupResult = {
  deletedCount: number;
  groups: { name: string; sId: string }[];
  mode: "dry_run" | "execution";
};

export async function cleanupOrphanedPodGroups(
  auth: Authenticator,
  {
    execute,
    podName: rawPodName,
  }: {
    execute: boolean;
    podName: string;
  }
): Promise<CleanupResult> {
  const podName = rawPodName.trim();
  if (!podName) {
    throw new Error("Pod name must not be empty.");
  }

  return withTransaction(async (transaction) => {
    // Archiving only sets ProjectMetadata.archivedAt, so archived Pods still have an active Space
    // row and are returned here.
    const existingSpace = await SpaceResource.fetchByName(
      auth,
      podName,
      transaction
    );
    if (existingSpace) {
      throw new Error(
        `A Space or Pod named "${podName}" still exists. Archived Pods must not be cleaned up.`
      );
    }

    const expectedGroupNames = [
      `${PROJECT_GROUP_PREFIX} ${podName}`,
      `${PROJECT_EDITOR_GROUP_PREFIX} ${podName}`,
    ];
    const groups: GroupResource[] = [];

    for (const groupName of expectedGroupNames) {
      const group = await GroupResource.dangerouslyFetchByName(auth, groupName);
      if (!group) {
        continue;
      }
      if (!group.isRegularAuto()) {
        throw new Error(
          `Group "${groupName}" is not an auto-created group. Refusing to delete it.`
        );
      }

      const grants = await GroupPermissionResource.listForGroup(
        auth,
        group,
        transaction
      );
      if (grants.length > 0) {
        throw new Error(
          `Group "${groupName}" still has grants. Refusing to delete it.`
        );
      }

      groups.push(group);
    }

    if (execute) {
      for (const group of groups) {
        const deleteResult = await group.delete(auth, { transaction });
        if (deleteResult.isErr()) {
          throw deleteResult.error;
        }
      }
    }

    return {
      deletedCount: execute ? groups.length : 0,
      groups: groups.map(({ name, sId }) => ({ name, sId })),
      mode: execute ? "execution" : "dry_run",
    };
  });
}

function runScript() {
  makeScript(
    {
      workspaceId: {
        type: "string",
        description: "Workspace sID",
        demandOption: true,
      },
      podName: {
        type: "string",
        description: "Name of the deleted Pod",
        demandOption: true,
      },
    },
    async ({ execute, podName, workspaceId }, logger) => {
      const workspace = await WorkspaceResource.fetchById(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace "${workspaceId}" not found.`);
      }

      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
      const result = await cleanupOrphanedPodGroups(auth, {
        execute,
        podName,
      });

      logger.info(
        {
          ...result,
          podName: podName.trim(),
          workspaceId: workspace.sId,
        },
        execute
          ? "Orphaned Pod group cleanup completed"
          : "Orphaned Pod group cleanup dry run completed"
      );
    }
  );
}

if (process.argv[1]?.endsWith("cleanup_orphaned_pod_groups.ts")) {
  runScript();
}
