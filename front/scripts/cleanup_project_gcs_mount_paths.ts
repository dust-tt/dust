import { makeProcessedMountFileName } from "@app/lib/api/files/mount_path";
import { getProcessedContentType } from "@app/lib/api/files/processing";
import { Authenticator, hasFeatureFlag } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { Op } from "sequelize";

const BATCH_SIZE_DEFAULT = 200;
const CONCURRENCY_DEFAULT = 4;

const PODS_PATH_PATTERN = /^(w\/[^/]+\/)pods\//;

/**
 * Derive the legacy projects/ GCS path from a pods/ mount path.
 * Returns null if the path is not a pods/ path.
 *
 * e.g. "w/<wId>/pods/<projectId>/files/report.pdf"
 *   -> "w/<wId>/projects/<projectId>/files/report.pdf"
 */
function toProjectsMountFilePath(podsPath: string): string | null {
  const projectsPath = podsPath.replace(PODS_PATH_PATTERN, "$1projects/");
  return projectsPath === podsPath ? null : projectsPath;
}

// Cleanup script: for each project_context file whose mountFilePath in the DB
// points to pods/, delete the equivalent legacy projects/ GCS object and its
// processed sibling (if any).
//
// The script is idempotent: ignoreNotFound is set on all deletes.
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
    batchSize: {
      type: "number",
      default: BATCH_SIZE_DEFAULT,
      describe: "Number of files to fetch per DB query.",
    },
    concurrency: {
      type: "number",
      default: CONCURRENCY_DEFAULT,
      describe: "Concurrent GCS deletions per batch.",
    },
  },
  async (
    { execute, wId, fromWorkspaceModelId, batchSize, concurrency },
    logger
  ) => {
    await runOnAllWorkspaces(
      async (workspace) => {
        const workspaceId = workspace.sId;

        const auth =
          await Authenticator.internalBuilderForWorkspace(workspaceId);

        const hasProjectEnabled = await hasFeatureFlag(auth, "projects");
        if (!hasProjectEnabled) {
          return;
        }

        logger.info(
          { workspaceId, execute },
          "[cleanup_project_gcs_mount_paths] Starting workspace"
        );

        const bucket = getPrivateUploadBucket();

        let lastId = 0;
        let totalProcessed = 0;
        let totalDeleted = 0;
        let totalSkipped = 0;
        let totalErrors = 0;

        while (true) {
          const rows = await FileModel.findAll({
            attributes: [
              "id",
              "contentType",
              "fileName",
              "mountFilePath",
              "useCaseMetadata",
            ],
            where: {
              workspaceId: workspace.id,
              useCase: "project_context",
              mountFilePath: { [Op.like]: "w/%/pods/%/files/%" },
              id: { [Op.gt]: lastId },
            },
            order: [["id", "ASC"]],
            limit: batchSize,
          });

          if (rows.length === 0) {
            break;
          }

          lastId = rows[rows.length - 1].id;

          await concurrentExecutor(
            rows,
            async (file) => {
              totalProcessed++;

              const { mountFilePath } = file;
              if (!mountFilePath) {
                totalSkipped++;
                return;
              }

              const oldProjectsPath = toProjectsMountFilePath(mountFilePath);
              if (!oldProjectsPath) {
                // Shouldn't happen given the WHERE clause, but guard anyway.
                totalSkipped++;
                return;
              }

              const processedContentType =
                file.useCaseMetadata?.skipFileProcessing === true
                  ? undefined
                  : getProcessedContentType(file.contentType);

              const oldProcessedPath = processedContentType
                ? makeProcessedMountFileName({
                    mountFilePath: oldProjectsPath,
                    processedContentType,
                  })
                : null;

              const fileId = FileResource.modelIdToSId({
                id: file.id,
                workspaceId: workspace.id,
              });

              if (!execute) {
                logger.info(
                  {
                    fileId,
                    fileName: file.fileName,
                    oldProjectsPath,
                    oldProcessedPath,
                  },
                  "[cleanup_project_gcs_mount_paths] Would delete (dry-run)"
                );
                totalDeleted++;
                return;
              }

              try {
                await bucket
                  .file(oldProjectsPath)
                  .delete({ ignoreNotFound: true });

                if (oldProcessedPath) {
                  await bucket
                    .file(oldProcessedPath)
                    .delete({ ignoreNotFound: true });
                }

                totalDeleted++;
              } catch (err) {
                logger.error(
                  {
                    err,
                    fileId,
                    mountFilePath,
                    oldProjectsPath,
                    oldProcessedPath,
                  },
                  "[cleanup_project_gcs_mount_paths] Failed to delete legacy GCS object"
                );
                totalErrors++;
              }
            },
            { concurrency }
          );

          logger.info(
            {
              workspaceId,
              lastId,
              totalProcessed,
              totalDeleted,
              totalSkipped,
              totalErrors,
              execute,
            },
            execute
              ? "[cleanup_project_gcs_mount_paths] Batch processed"
              : "[cleanup_project_gcs_mount_paths] [DRY RUN] Batch processed"
          );
        }

        logger.info(
          {
            workspaceId,
            totalProcessed,
            totalDeleted,
            totalSkipped,
            totalErrors,
            execute,
          },
          "[cleanup_project_gcs_mount_paths] Workspace done"
        );
      },
      { wId, fromWorkspaceId: fromWorkspaceModelId }
    );

    logger.info(
      { execute },
      "[cleanup_project_gcs_mount_paths] All workspaces done."
    );
  }
);
