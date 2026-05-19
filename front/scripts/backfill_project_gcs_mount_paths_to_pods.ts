import {
  makeProcessedMountFileName,
  toPodsMountFilePath,
} from "@app/lib/api/files/mount_path";
import { getProcessedContentType } from "@app/lib/api/files/processing";
import { Authenticator, hasFeatureFlag } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { ModelId } from "@app/types/shared/model_id";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import assert from "assert";
import { Op } from "sequelize";

const BATCH_SIZE_DEFAULT = 200;
const CONCURRENCY_DEFAULT = 4;

async function copyIfNeeded({
  sourcePath,
  destPath,
  execute,
}: {
  sourcePath: string;
  destPath: string;
  execute: boolean;
}): Promise<"copied" | "would_copy" | "skipped_exists" | "skipped_missing"> {
  const bucket = getPrivateUploadBucket();

  const [sourceExists] = await bucket.file(sourcePath).exists();
  if (!sourceExists) {
    return "skipped_missing";
  }

  const [destExists] = await bucket.file(destPath).exists();
  if (destExists) {
    return "skipped_exists";
  }

  if (!execute) {
    return "would_copy";
  }

  await bucket.copyFile(sourcePath, destPath);
  return "copied";
}

makeScript(
  {
    wId: {
      type: "string",
      describe: "Workspace sId to backfill. Omit to run on all workspaces.",
    },
    fromWorkspaceModelId: {
      type: "number",
      describe: "Skip workspaces with model id below this value, for resuming.",
    },
    batchSize: {
      type: "number",
      default: BATCH_SIZE_DEFAULT,
      describe: "Number of files to fetch per DB query.",
    },
    concurrency: {
      type: "number",
      default: CONCURRENCY_DEFAULT,
      describe: "Concurrent file copies per batch.",
    },
  },
  async (
    { execute, wId, fromWorkspaceModelId, batchSize, concurrency },
    logger
  ) => {
    logger.info(
      { execute, wId, fromWorkspaceModelId, batchSize, concurrency },
      "[backfill_project_gcs_mount_paths_to_pods] Starting"
    );

    await runOnAllWorkspaces(
      async (workspace) => {
        const auth = await Authenticator.internalBuilderForWorkspace(
          workspace.sId
        );

        const hasProjectEnabled = await hasFeatureFlag(auth, "projects");
        if (!hasProjectEnabled) {
          logger.info(
            { workspaceId: workspace.sId },
            "[backfill_project_gcs_mount_paths_to_pods] Workspace does not have `projects` FF enabled, skipping"
          );
          return;
        }

        let lastId: ModelId = 0;
        let totalProcessed = 0;
        let totalCopied = 0;
        let totalWouldCopy = 0;
        let totalSkippedExisting = 0;
        let totalSkippedMissing = 0;
        let totalErrors = 0;

        const runCopy = async ({
          fileId,
          kind,
          sourcePath,
          destPath,
        }: {
          fileId: string;
          kind: "original" | "processed";
          sourcePath: string;
          destPath: string;
        }) => {
          try {
            const result = await copyIfNeeded({
              sourcePath,
              destPath,
              execute,
            });

            switch (result) {
              case "copied":
                totalCopied++;
                break;
              case "would_copy":
                totalWouldCopy++;
                logger.info(
                  {
                    workspaceId: workspace.sId,
                    fileId,
                    kind,
                    from: sourcePath,
                    to: destPath,
                  },
                  "[backfill_project_gcs_mount_paths_to_pods] Would copy object"
                );
                break;
              case "skipped_exists":
                totalSkippedExisting++;
                break;
              case "skipped_missing":
                totalSkippedMissing++;
                logger.info(
                  {
                    workspaceId: workspace.sId,
                    fileId,
                    kind,
                    sourcePath,
                  },
                  "[backfill_project_gcs_mount_paths_to_pods] Source object missing, skipping"
                );
                break;
            }
          } catch (err) {
            totalErrors++;
            logger.error(
              {
                workspaceId: workspace.sId,
                fileId,
                kind,
                from: sourcePath,
                to: destPath,
                err: normalizeError(err),
              },
              "[backfill_project_gcs_mount_paths_to_pods] Copy failed"
            );
          }
        };

        logger.info(
          { workspaceId: workspace.sId, execute },
          "[backfill_project_gcs_mount_paths_to_pods] Starting workspace"
        );

        while (true) {
          const rows = await FileModel.findAll({
            attributes: ["id"],
            where: {
              workspaceId: workspace.id,
              useCase: "project_context",
              mountFilePath: {
                [Op.like]: `w/${workspace.sId}/projects/%/files/%`,
              },
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

              assert(
                file.mountFilePath,
                "file.mountFilePath is set by SQL filter"
              );
              const destMountFilePath = toPodsMountFilePath(file.mountFilePath);
              assert(
                destMountFilePath,
                `expected project mount path, got ${file.mountFilePath}`
              );

              await runCopy({
                fileId: file.sId,
                kind: "original",
                sourcePath: file.mountFilePath,
                destPath: destMountFilePath,
              });

              const processedContentType =
                file.useCaseMetadata?.skipFileProcessing === true
                  ? undefined
                  : getProcessedContentType(file.contentType);
              if (processedContentType) {
                await runCopy({
                  fileId: file.sId,
                  kind: "processed",
                  sourcePath: makeProcessedMountFileName({
                    mountFilePath: file.mountFilePath,
                    processedContentType,
                  }),
                  destPath: makeProcessedMountFileName({
                    mountFilePath: destMountFilePath,
                    processedContentType,
                  }),
                });
              }
            },
            { concurrency }
          );
          logger.info(
            {
              workspaceId: workspace.sId,
              lastId,
              totalProcessed,
              totalCopied,
              totalWouldCopy,
              totalSkippedExisting,
              totalSkippedMissing,
              totalErrors,
              execute,
            },
            execute
              ? "[backfill_project_gcs_mount_paths_to_pods] Batch processed"
              : "[backfill_project_gcs_mount_paths_to_pods] Dry-run batch processed"
          );
        }

        logger.info(
          {
            workspaceId: workspace.sId,
            totalProcessed,
            totalCopied,
            totalWouldCopy,
            totalSkippedExisting,
            totalSkippedMissing,
            totalErrors,
            execute,
          },
          "[backfill_project_gcs_mount_paths_to_pods] Workspace done"
        );
      },
      { wId, fromWorkspaceId: fromWorkspaceModelId }
    );

    logger.info("[backfill_project_gcs_mount_paths_to_pods] All done");
  }
);
