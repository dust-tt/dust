import { toPodMountFilePath } from "@app/lib/api/files/mount_path";
import { Authenticator, hasFeatureFlag } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import assert from "@app/lib/utils/assert";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { normalizeError } from "@app/types/shared/utils/error_utils";

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
    concurrency: {
      type: "number",
      default: CONCURRENCY_DEFAULT,
      describe: "Concurrent file copies.",
    },
  },
  async ({ execute, wId, fromWorkspaceModelId, concurrency }, logger) => {
    logger.info(
      { execute, wId, fromWorkspaceModelId, concurrency },
      "[backfill_project_gcs_mount_paths_to_pods] Starting"
    );

    const bucket = getPrivateUploadBucket();

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

        let totalProcessed = 0;
        let totalCopied = 0;
        let totalWouldCopy = 0;
        let totalSkippedExisting = 0;
        let totalSkippedMissing = 0;
        let totalSkippedNoTransform = 0;
        let totalErrors = 0;

        const runCopy = async ({
          sourcePath,
          destPath,
        }: {
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
                  { workspaceId: workspace.sId, sourcePath },
                  "[backfill_project_gcs_mount_paths_to_pods] Source object missing, skipping"
                );
                break;
            }
          } catch (err) {
            totalErrors++;
            logger.error(
              {
                workspaceId: workspace.sId,
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

        // GCS is the source of truth: enumerate all objects under the workspace's
        // projects/ prefix. toPodMountFilePath transforms both original and processed
        // file paths uniformly (w/.../projects/... → w/.../pods/...).
        const prefix = `w/${workspace.sId}/projects/`;

        const { files, pageFetchCount } = await bucket.getAllFilesByPrefix({
          prefix,
        });

        logger.info(
          {
            workspaceId: workspace.sId,
            fileCount: files.length,
            pageFetchCount,
          },
          "[backfill_project_gcs_mount_paths_to_pods] Listed GCS objects"
        );

        await concurrentExecutor(
          files,
          async (gcsFile) => {
            totalProcessed++;

            const sourcePath = gcsFile.name;
            const destPath = toPodMountFilePath(sourcePath);
            assert(destPath, `expected project mount path, got ${sourcePath}`);

            await runCopy({ sourcePath, destPath });
          },
          { concurrency }
        );

        logger.info(
          {
            workspaceId: workspace.sId,
            totalProcessed,
            totalCopied,
            totalWouldCopy,
            totalSkippedExisting,
            totalSkippedMissing,
            totalSkippedNoTransform,
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
