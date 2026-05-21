// Script for the /projects/ → /pods/ GCS mount path migration.
//
// GCS objects at w/{wId}/projects/{spaceId}/files/... were already copied to
// w/{wId}/pods/{spaceId}/files/... by the backfill script backfill_project_mount_paths_to_pods.
//
// This script performs the DB-only step:
//   1. For every project_context file whose `mountFilePath` still carries the
//      /projects/ prefix, rewrite it to /pods/.
//   2. For every project_metadata row whose `pinnedFramePath` is still scoped
//      under `project/`, rewrite the scope prefix to `pod/`.

import { toPodMountFilePath } from "@app/lib/api/files/mount_path";
import { Authenticator, hasFeatureFlag } from "@app/lib/auth";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { ProjectMetadataModel } from "@app/lib/resources/storage/models/project_metadata";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { ModelId } from "@app/types/shared/model_id";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { Op } from "sequelize";

const PROJECT_SCOPE_PREFIX = "project/";
const POD_SCOPE_PREFIX = "pod/";

function toPodScopedPath(scopedPath: string): string | null {
  if (!scopedPath.startsWith(PROJECT_SCOPE_PREFIX)) {
    return null;
  }
  return `${POD_SCOPE_PREFIX}${scopedPath.slice(PROJECT_SCOPE_PREFIX.length)}`;
}

const BATCH_SIZE_DEFAULT = 200;
const CONCURRENCY_DEFAULT = 4;

makeScript(
  {
    wId: {
      type: "string",
      describe: "Workspace sId to migrate. Omit to run on all workspaces.",
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
      describe: "Concurrent DB updates per batch.",
    },
  },
  async (
    { execute, wId, fromWorkspaceModelId, batchSize, concurrency },
    logger
  ) => {
    logger.info(
      { execute, wId, fromWorkspaceModelId, batchSize, concurrency },
      "[migrate_project_mount_paths_to_pods] Starting"
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
            "[migrate_project_mount_paths_to_pods] Workspace does not have `projects` FF enabled, skipping"
          );
          return;
        }

        logger.info(
          { workspaceId: workspace.sId, execute },
          "[migrate_project_mount_paths_to_pods] Starting workspace"
        );

        let lastId: ModelId = 0;
        let totalProcessed = 0;
        let totalMigrated = 0;
        let totalSkipped = 0;
        let totalErrors = 0;

        while (true) {
          // Fetch rows still on the old /projects/ prefix
          const rows = await FileModel.findAll({
            attributes: ["id", "mountFilePath"],
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

          await concurrentExecutor(
            rows,
            async (row) => {
              totalProcessed++;

              if (!row.mountFilePath) {
                totalSkipped++;
                return;
              }

              const newPath = toPodMountFilePath(row.mountFilePath);
              if (!newPath) {
                logger.warn(
                  { fileId: row.id, mountFilePath: row.mountFilePath },
                  "[migrate_project_mount_paths_to_pods] Could not derive pod path, skipping"
                );
                totalSkipped++;
                return;
              }

              if (!execute) {
                logger.info(
                  {
                    fileId: row.id,
                    from: row.mountFilePath,
                    to: newPath,
                  },
                  "[migrate_project_mount_paths_to_pods] Would update (dry-run)"
                );
                totalMigrated++;
                return;
              }

              try {
                await FileModel.update(
                  { mountFilePath: newPath },
                  { where: { id: row.id, workspaceId: workspace.id } }
                );
                totalMigrated++;
              } catch (err) {
                totalErrors++;
                logger.error(
                  {
                    err: normalizeError(err),
                    fileId: row.id,
                    from: row.mountFilePath,
                    to: newPath,
                  },
                  "[migrate_project_mount_paths_to_pods] Update failed"
                );
              }
            },
            { concurrency }
          );

          logger.info(
            {
              workspaceId: workspace.sId,
              lastId,
              totalProcessed,
              totalMigrated,
              totalSkipped,
              totalErrors,
              execute,
            },
            execute
              ? "[migrate_project_mount_paths_to_pods] Batch processed"
              : "[migrate_project_mount_paths_to_pods] Dry-run batch processed"
          );
        }

        logger.info(
          {
            workspaceId: workspace.sId,
            totalProcessed,
            totalMigrated,
            totalSkipped,
            totalErrors,
            execute,
          },
          "[migrate_project_mount_paths_to_pods] Workspace files done"
        );

        // Pass 2: migrate project_metadata.pinnedFramePath from `project/` to
        // `pod/` scope. No id cursor needed: each successful update removes the
        // row from the `project/%` filter, so the query naturally drains.
        let projectMetadataTotalProcessed = 0;
        let projectMetadataTotalMigrated = 0;
        let projectMetadataTotalSkipped = 0;
        let projectMetadataTotalErrors = 0;

        while (true) {
          const rows = await ProjectMetadataModel.findAll({
            attributes: ["id", "pinnedFramePath"],
            where: {
              workspaceId: workspace.id,
              pinnedFramePath: {
                [Op.like]: `${PROJECT_SCOPE_PREFIX}%`,
              },
            },
            order: [["id", "ASC"]],
            limit: batchSize,
          });

          if (rows.length === 0) {
            break;
          }

          await concurrentExecutor(
            rows,
            async (row) => {
              projectMetadataTotalProcessed++;

              if (!row.pinnedFramePath) {
                projectMetadataTotalSkipped++;
                return;
              }

              const newPath = toPodScopedPath(row.pinnedFramePath);
              if (!newPath) {
                logger.warn(
                  {
                    projectMetadataId: row.id,
                    pinnedFramePath: row.pinnedFramePath,
                  },
                  "[migrate_project_mount_paths_to_pods] Could not derive pod-scoped pinnedFramePath, skipping"
                );
                projectMetadataTotalSkipped++;
                return;
              }

              if (!execute) {
                logger.info(
                  {
                    projectMetadataId: row.id,
                    from: row.pinnedFramePath,
                    to: newPath,
                  },
                  "[migrate_project_mount_paths_to_pods] Would update pinnedFramePath (dry-run)"
                );
                projectMetadataTotalMigrated++;
                return;
              }

              try {
                await ProjectMetadataModel.update(
                  { pinnedFramePath: newPath },
                  { where: { id: row.id, workspaceId: workspace.id } }
                );
                projectMetadataTotalMigrated++;
              } catch (err) {
                projectMetadataTotalErrors++;
                logger.error(
                  {
                    err: normalizeError(err),
                    projectMetadataId: row.id,
                    from: row.pinnedFramePath,
                    to: newPath,
                  },
                  "[migrate_project_mount_paths_to_pods] pinnedFramePath update failed"
                );
              }
            },
            { concurrency }
          );

          logger.info(
            {
              workspaceId: workspace.sId,
              projectMetadataTotalProcessed,
              projectMetadataTotalMigrated,
              projectMetadataTotalSkipped,
              projectMetadataTotalErrors,
              execute,
            },
            execute
              ? "[migrate_project_mount_paths_to_pods] pinnedFramePath batch processed"
              : "[migrate_project_mount_paths_to_pods] Dry-run pinnedFramePath batch processed"
          );

          // In dry-run we don't update, so the filter still matches the same
          // rows — bail after a single batch to avoid an infinite loop.
          if (!execute) {
            break;
          }
        }

        logger.info(
          {
            workspaceId: workspace.sId,
            projectMetadataTotalProcessed,
            projectMetadataTotalMigrated,
            projectMetadataTotalSkipped,
            projectMetadataTotalErrors,
            execute,
          },
          "[migrate_project_mount_paths_to_pods] Workspace pinnedFramePath done"
        );
      },
      { wId, fromWorkspaceId: fromWorkspaceModelId }
    );

    logger.info(
      { execute },
      "[migrate_project_mount_paths_to_pods] All workspaces done"
    );
  }
);
