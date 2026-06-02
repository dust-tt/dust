import {
  disambiguateFileName,
  getProjectFilesBasePath,
  makeProcessedMountFileName,
} from "@app/lib/api/files/mount_path";
import {
  getProcessedContentType,
  hasProcessedVersion,
} from "@app/lib/api/files/processing";
import { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { Op } from "sequelize";

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
              const unsuffixedPath = `${basePath}${file.fileName}`;

              const disambiguatedProcessedPath = hasProcessedVersion(
                file.contentType
              )
                ? makeProcessedMountFileName({
                    mountFilePath: disambiguatedPath,
                    processedContentType: getProcessedContentType(
                      file.contentType
                    ),
                  })
                : null;
              const unsuffixedProcessedPath = hasProcessedVersion(
                file.contentType
              )
                ? makeProcessedMountFileName({
                    mountFilePath: unsuffixedPath,
                    processedContentType: getProcessedContentType(
                      file.contentType
                    ),
                  })
                : null;

              // Case A — DB points at the disambiguated path; un-suffixed sibling in GCS may be an
              // orphan from an earlier backfill round. Switch DB back to un-suffixed and delete
              // the disambiguated GCS copies.
              if (file.mountFilePath === disambiguatedPath) {
                const [unsuffixedExists] = await bucket
                  .file(unsuffixedPath)
                  .exists();
                if (!unsuffixedExists) {
                  // No orphan to merge with — likely a legitimate disambiguation.
                  totalSkipped++;
                  return;
                }

                // The un-suffixed GCS object may belong to another DB file with the same name
                // (legitimate disambiguation, not an orphan from the broken backfill). Skip in
                // that case — otherwise the update below would hit the unique constraint on
                // (workspaceId, mountFilePath).
                const ownedByOther = await FileModel.findOne({
                  attributes: ["id"],
                  where: {
                    workspaceId: workspace.id,
                    mountFilePath: unsuffixedPath,
                    id: { [Op.ne]: file.id },
                  },
                });
                if (ownedByOther) {
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
                  // Update DB first so any concurrent uploadContent dual-writes hit the
                  // un-suffixed path instead of the soon-to-be-deleted disambiguated one.
                  await FileModel.update(
                    { mountFilePath: unsuffixedPath },
                    { where: { id: file.id, workspaceId: workspace.id } }
                  );

                  // Refresh un-suffixed from the canonical original (it may be stale — left over
                  // from an earlier backfill round, predating any frame edits).
                  await bucket.copyFile(
                    file.getCloudStoragePath(auth, "original"),
                    unsuffixedPath
                  );

                  if (unsuffixedProcessedPath) {
                    await bucket.copyFile(
                      file.getCloudStoragePath(auth, "processed"),
                      unsuffixedProcessedPath
                    );
                  }

                  await bucket.delete(disambiguatedPath, {
                    ignoreNotFound: true,
                  });
                  if (disambiguatedProcessedPath) {
                    await bucket.delete(disambiguatedProcessedPath, {
                      ignoreNotFound: true,
                    });
                  }

                  totalCleaned++;
                } catch (err) {
                  logger.error(
                    { err, fileId: file.sId },
                    "[cleanup_duplicate_project_mount_paths] Case A failed"
                  );
                }
                return;
              }

              // Case B — DB already points at the un-suffixed path, but a disambiguated GCS copy
              // for this file's sId may still be hanging around from an earlier backfill round.
              // Disambiguated paths embed THIS file's sId so they can't be legitimately owned by
              // another file — safe to delete unconditionally when present.
              if (file.mountFilePath === unsuffixedPath) {
                const [disambiguatedExists] = await bucket
                  .file(disambiguatedPath)
                  .exists();
                if (!disambiguatedExists) {
                  totalSkipped++;
                  return;
                }

                if (!execute) {
                  logger.info(
                    {
                      fileId: file.sId,
                      fileName: file.fileName,
                      orphan: disambiguatedPath,
                    },
                    "[cleanup_duplicate_project_mount_paths] Would delete disambiguated orphan (dry-run)"
                  );
                  totalCleaned++;
                  return;
                }

                try {
                  await bucket.delete(disambiguatedPath, {
                    ignoreNotFound: true,
                  });
                  if (disambiguatedProcessedPath) {
                    await bucket.delete(disambiguatedProcessedPath, {
                      ignoreNotFound: true,
                    });
                  }
                  totalCleaned++;
                } catch (err) {
                  logger.error(
                    { err, fileId: file.sId },
                    "[cleanup_duplicate_project_mount_paths] Case B failed"
                  );
                }
                return;
              }

              // Mount path is neither the un-suffixed nor the disambiguated form for this file
              // (e.g., still pointing at a stale conversation path). Skip.
              totalSkipped++;
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
