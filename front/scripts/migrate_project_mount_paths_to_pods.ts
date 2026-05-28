// Script for the /projects/ → /pods/ GCS mount path migration.
//
// GCS objects at w/{wId}/projects/{spaceId}/files/... were already copied to
// w/{wId}/pods/{spaceId}/files/... by the backfill script backfill_project_mount_paths_to_pods.
//
// This script performs the following: for every project_context file whose `mountFilePath` still
// carries the /projects/ prefix, rewrite it to /pods/.

import { toPodMountFilePath } from "@app/lib/api/files/mount_path";
import { FeatureFlagModel } from "@app/lib/models/feature_flag";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId } from "@app/types/shared/model_id";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { Op } from "sequelize";

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

    // Pre-filter to workspaces that have the `projects` feature flag enabled.
    // Most workspaces do not, so this avoids paying per-workspace overhead for them.
    let workspaces: { id: ModelId; sId: string }[];
    if (wId) {
      const workspace = await WorkspaceResource.fetchById(wId);
      if (!workspace) {
        throw new Error(`Workspace not found: ${wId}`);
      }
      const hasProjectsFlag = await FeatureFlagModel.findOne({
        attributes: ["workspaceId"],
        where: { name: "projects", workspaceId: workspace.id },
      });
      if (!hasProjectsFlag) {
        logger.info(
          { workspaceId: workspace.sId },
          "[migrate_project_mount_paths_to_pods] Workspace does not have `projects` FF enabled, nothing to do"
        );
        return;
      }
      workspaces = [{ id: workspace.id, sId: workspace.sId }];
    } else {
      const flagRows = await FeatureFlagModel.findAll({
        attributes: ["workspaceId"],
        where: {
          name: "projects",
          ...(fromWorkspaceModelId
            ? { workspaceId: { [Op.gte]: fromWorkspaceModelId } }
            : {}),
        },
        // WORKSPACE_ISOLATION_BYPASS: cross-workspace migration script that lists workspace IDs with the `projects` flag.
        // @ts-expect-error -- Script operates across all workspaces.
        // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
        dangerouslyBypassWorkspaceIsolationSecurity: true,
      });
      const enabledWorkspaceModelIds = Array.from(
        new Set(flagRows.map((f) => f.workspaceId))
      );
      const resources = await WorkspaceResource.fetchByModelIds(
        enabledWorkspaceModelIds
      );
      workspaces = resources.map((w) => ({ id: w.id, sId: w.sId }));
    }

    logger.info(
      { workspaceCount: workspaces.length },
      "[migrate_project_mount_paths_to_pods] Workspaces with `projects` FF enabled"
    );

    await concurrentExecutor(
      workspaces,
      async (workspace) => {
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
      },
      { concurrency }
    );

    logger.info(
      { execute },
      "[migrate_project_mount_paths_to_pods] All workspaces done"
    );
  }
);
