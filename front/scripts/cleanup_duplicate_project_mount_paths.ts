import { Op } from "sequelize";

import {
  disambiguateFileName,
  getProjectFilesBasePath,
  makeProcessedMountFileName,
} from "@app/lib/api/files/mount_path";
import {
  getProcessedContentType,
  hasProcessedVersion,
} from "@app/lib/api/files/processing";
import { Authenticator, hasFeatureFlag } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";

const BATCH_SIZE_DEFAULT = 200;
const CONCURRENCY_DEFAULT = 4;

// Cleanup for the broken backfill run that disambiguated already-mounted project_context files.
// For each file whose `mountFilePath` matches the disambiguated form for that file
// (basePath + disambiguateFileName(file)) AND whose un-suffixed sibling exists in GCS, switch the
// DB back to the un-suffixed path, refresh the un-suffixed GCS object from the canonical, and
// delete the disambiguated GCS copies. Files whose un-suffixed sibling does not exist are skipped
// (legitimate disambiguation case).
makeScript(
  {
    wId: {
      type: "string",
      describe: "Workspace sId to clean up (omit to run on all workspaces).",
    },
    fromWorkspaceModelId: {
      type: "number",
      describe:
        "Skip workspaces with model id below this value (for resuming).",
    },
    batchSize: {
      type: "number",
      default: BATCH_SIZE_DEFAULT,
      describe: "Number of files to fetch per DB query.",
    },
    concurrency: {
      type: "number",
      default: CONCURRENCY_DEFAULT,
      describe: "Concurrent file cleanups per batch.",
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
          throw new Error("Workspace does not have `projects` FF enabled.");
        }

        logger.info(
          { workspaceId, execute },
          "[cleanup_duplicate_project_mount_paths] Starting workspace"
        );

        const bucket = getPrivateUploadBucket();

        let lastId = 0;
        let totalProcessed = 0;
        let totalCleaned = 0;
        let totalSkipped = 0;

        while (true) {
          const rows = await FileModel.findAll({
            attributes: ["id"],
            where: {
              workspaceId: workspace.id,
              useCase: "project_context",
              mountFilePath: { [Op.ne]: null },
              id: { [Op.gt]: lastId },
            },
            order: [["id", "ASC"]],
            limit: batchSize,
          });

          if (rows.length === 0) {
            break;
          }

          lastId = rows[rows.length - 1].id;

          const files = await FileResource.fetchByModelIdsWithAuth(
            auth,
            rows.map((r) => r.id)
          );

          await concurrentExecutor(
            files,
            async (file) => {
              totalProcessed++;

              const spaceId = file.useCaseMetadata?.spaceId;
              if (!spaceId || !file.mountFilePath) {
                totalSkipped++;
                return;
              }

              const basePath = getProjectFilesBasePath({
                workspaceId: workspace.sId,
                projectId: spaceId,
              });

              const disambiguatedPath = `${basePath}${disambiguateFileName(file)}`;
              // Only act when the current mount path matches the disambiguated form for THIS file.
              if (file.mountFilePath !== disambiguatedPath) {
                totalSkipped++;
                return;
              }

              const unsuffixedPath = `${basePath}${file.fileName}`;

              const [unsuffixedExists] = await bucket
                .file(unsuffixedPath)
                .exists();
              if (!unsuffixedExists) {
                // No orphan to merge with — likely a legitimate disambiguation.
                totalSkipped++;
                return;
              }

              if (!execute) {
                logger.info(
                  {
                    fileId: file.sId,
                    fileName: file.fileName,
                    from: disambiguatedPath,
                    to: unsuffixedPath,
                  },
                  "[cleanup_duplicate_project_mount_paths] Would un-disambiguate (dry-run)"
                );
                totalCleaned++;
                return;
              }

              try {
                // Update DB first so any concurrent uploadContent dual-writes hit the un-suffixed
                // path instead of the soon-to-be-deleted disambiguated one.
                await FileModel.update(
                  { mountFilePath: unsuffixedPath },
                  { where: { id: file.id, workspaceId: workspace.id } }
                );

                // Refresh un-suffixed from the canonical original (it may be stale — left over
                // from the first backfill run, predating any frame edits).
                await bucket.copyFile(
                  file.getCloudStoragePath(auth, "original"),
                  unsuffixedPath
                );

                let disambiguatedProcessed: string | null = null;
                if (hasProcessedVersion(file.contentType)) {
                  const processedContentType = getProcessedContentType(
                    file.contentType
                  );
                  const unsuffixedProcessed = makeProcessedMountFileName({
                    mountFilePath: unsuffixedPath,
                    processedContentType,
                  });
                  disambiguatedProcessed = makeProcessedMountFileName({
                    mountFilePath: disambiguatedPath,
                    processedContentType,
                  });
                  await bucket.copyFile(
                    file.getCloudStoragePath(auth, "processed"),
                    unsuffixedProcessed
                  );
                }

                await bucket.delete(disambiguatedPath, { ignoreNotFound: true });
                if (disambiguatedProcessed) {
                  await bucket.delete(disambiguatedProcessed, {
                    ignoreNotFound: true,
                  });
                }

                totalCleaned++;
              } catch (err) {
                logger.error(
                  { err, fileId: file.sId },
                  "[cleanup_duplicate_project_mount_paths] Failed"
                );
              }
            },
            { concurrency }
          );
        }

        logger.info(
          {
            workspaceId,
            totalProcessed,
            totalCleaned,
            totalSkipped,
            execute,
          },
          "[cleanup_duplicate_project_mount_paths] Workspace done"
        );
      },
      { wId, fromWorkspaceId: fromWorkspaceModelId }
    );
  }
);
