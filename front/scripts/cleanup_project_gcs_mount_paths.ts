import { getBaseMountPathForWorkspace } from "@app/lib/api/files/mount_path";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const PROGRESS_LOG_INTERVAL = 100;

// Cleanup script: for every workspace, delete all legacy GCS objects stored
// under the `w/<wId>/projects/` prefix.
//
// The script is idempotent: re-running it on an already-cleaned workspace
// deletes nothing.
makeScript(
  {
    wId: {
      type: "string",
      describe: "WorkspaceId to clean up (omit to run on all workspaces).",
    },
    fromWorkspaceModelId: {
      type: "number",
      describe:
        "Skip workspaces with model id below this value (for resuming after a partial run).",
    },
  },
  async ({ execute, wId, fromWorkspaceModelId }, logger) => {
    const bucket = getPrivateUploadBucket();

    const failedWorkspaceIds: string[] = [];
    let processedCount = 0;

    await runOnAllWorkspaces(
      async (workspace) => {
        const workspaceId = workspace.sId;

        // e.g. "w/<wId>/projects/".
        const projectsPrefix = `${getBaseMountPathForWorkspace({ workspaceId })}projects/`;

        if (!execute) {
          logger.info(
            { workspaceId, projectsPrefix },
            "[cleanup_project_gcs_mount_paths] [DRY RUN] Would delete all objects under prefix"
          );
        } else {
          // Deletes every object under the prefix.
          try {
            await bucket.deleteByPrefix(projectsPrefix);
          } catch (err) {
            failedWorkspaceIds.push(workspaceId);
            logger.error(
              { err: normalizeError(err), workspaceId, projectsPrefix },
              "[cleanup_project_gcs_mount_paths] Failed to delete legacy projects objects"
            );
          }
        }

        processedCount++;
        if (processedCount % PROGRESS_LOG_INTERVAL === 0) {
          logger.info(
            {
              execute,
              processedCount,
              lastWorkspaceModelId: workspace.id,
              failedWorkspaceCount: failedWorkspaceIds.length,
            },
            "[cleanup_project_gcs_mount_paths] Progress: last workspace processed"
          );
        }
      },
      { wId, fromWorkspaceId: fromWorkspaceModelId }
    );

    logger.info(
      {
        execute,
        processedCount,
        failedWorkspaceCount: failedWorkspaceIds.length,
        failedWorkspaceIds,
      },
      "[cleanup_project_gcs_mount_paths] All workspaces done."
    );
  }
);
