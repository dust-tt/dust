import { Authenticator, hasFeatureFlag } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { Op } from "sequelize";

const BATCH_SIZE_DEFAULT = 200;
const CONCURRENCY_DEFAULT = 4;

makeScript(
  {
    wId: {
      type: "string",
      describe: "Workspace sId to backfill (omit to run on all workspaces).",
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
      describe: "Concurrent file mount-path resolutions per batch.",
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
          "[backfill_project_mount_paths] Starting workspace"
        );

        let lastId = 0;
        let totalProcessed = 0;
        let totalUpdated = 0;

        while (true) {
          const rows = await FileModel.findAll({
            attributes: ["id"],
            where: {
              workspaceId: workspace.id,
              useCase: "project_context",
              mountFilePath: null,
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

              // Skip files that don't have a spaceId in their metadata. IT can't be mounted.
              if (!file.useCaseMetadata?.spaceId) {
                return;
              }

              if (!execute) {
                logger.info(
                  {
                    fileId: file.sId,
                    fileName: file.fileName,
                    spaceId: file.useCaseMetadata.spaceId,
                  },
                  "[backfill_project_mount_paths] Would set mount path (dry-run)"
                );
                totalUpdated++;
                return;
              }

              try {
                await file.ensureMountFilePath(auth);
                totalUpdated++;
              } catch (err) {
                logger.error(
                  { err, fileId: file.sId },
                  "[backfill_project_mount_paths] Failed to set mount path"
                );
              }
            },
            { concurrency }
          );
        }

        logger.info(
          { workspaceId, totalProcessed, totalUpdated, execute },
          "[backfill_project_mount_paths] Workspace done"
        );
      },
      { wId, fromWorkspaceId: fromWorkspaceModelId }
    );
  }
);
