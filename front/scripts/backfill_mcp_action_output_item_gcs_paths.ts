import { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { AgentMCPActionOutputItemModel } from "@app/lib/models/agent/actions/mcp";
import {
  deleteContentsFromGcs,
  MCP_OUTPUT_ITEMS_PREFIX,
} from "@app/lib/resources/agent_mcp_action/output_storage";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { concurrentExecutor, withRetry } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { WhereOptions } from "sequelize";
import { Op } from "sequelize";

import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

const BATCH_SIZE_DEFAULT = 200;

/**
 * Rewrites existing output items at deterministic paths so backfill retries are idempotent.
 */
async function rewriteContentToGcs(
  auth: Authenticator,
  action: AgentMCPActionResource,
  item: Pick<AgentMCPActionOutputItemModel, "id" | "content">
): Promise<Result<string, Error>> {
  const workspace = auth.getNonNullableWorkspace();
  const gcsPath = `w/${workspace.sId}/${MCP_OUTPUT_ITEMS_PREFIX}/${action.sId}/${item.id}.json`;
  const result = await withRetry(() =>
    getPrivateUploadBucket()
      .file(gcsPath)
      .save(Buffer.from(JSON.stringify(item.content), "utf-8"), {
        contentType: "application/json",
      })
  );
  if (result.isErr()) {
    // A failed save may still have persisted its object before returning an error.
    const cleanupResult = await deleteContentsFromGcs([gcsPath]);
    if (cleanupResult.isErr()) {
      logger.error(
        { err: cleanupResult.error, actionId: action.sId },
        "Failed to clean up partially written MCP output items"
      );
    }
    return result;
  }
  return new Ok(gcsPath);
}

// New paths live under `w/<workspaceId>/...`. Anything else (`mcp_output_items/...`
// or NULL) needs to be migrated.
function isMigratedPath(p: string | null): boolean {
  return p !== null && p.startsWith("w/");
}

makeScript(
  {
    workspaceId: {
      type: "string",
      describe: "Restrict the backfill to a single workspace sId",
    },
    fromWorkspaceId: {
      type: "number",
      describe:
        "Resume: skip workspaces with model id < this value (used when iterating all workspaces)",
    },
    batchSize: {
      type: "number",
      default: BATCH_SIZE_DEFAULT,
      describe: "Number of output items to process per DB batch per workspace",
    },
    concurrency: {
      type: "number",
      default: 4,
      describe: "Concurrent items processed per batch",
    },
    deleteOldGcs: {
      type: "boolean",
      default: false,
      describe:
        "Delete the legacy `mcp_output_items/...` GCS object after a successful row update",
    },
  },
  async (
    {
      execute,
      workspaceId,
      fromWorkspaceId,
      batchSize,
      concurrency,
      deleteOldGcs,
    },
    scriptLogger
  ) => {
    scriptLogger.info(
      { workspaceId, fromWorkspaceId, batchSize, execute },
      "[Backfill MCP output GCS paths] Starting"
    );

    await runOnAllWorkspaces(
      async (workspace) => {
        const workspaceModelId = workspace.id;

        const auth = await Authenticator.internalAdminForWorkspace(
          workspace.sId
        );
        const bucket = getPrivateUploadBucket();

        let lastId: ModelId | null = null;
        let migrated = 0;
        let skipped = 0;
        let errors = 0;

        while (true) {
          const where: WhereOptions<AgentMCPActionOutputItemModel> = {
            workspaceId: workspaceModelId,
          };

          if (lastId !== null) {
            where.id = { [Op.gt]: lastId };
          }

          const items = await AgentMCPActionOutputItemModel.findAll({
            where,
            order: [["id", "ASC"]],
            limit: batchSize,
          });

          if (items.length === 0) {
            break;
          }
          lastId = items[items.length - 1].id;

          // Pre-fetch action resources for this batch.
          const uniqueActionModelIds = [
            ...new Set(items.map((i) => i.agentMCPActionId)),
          ];
          const actionResources = await AgentMCPActionResource.fetchByModelIds(
            auth,
            uniqueActionModelIds
          );
          const actionByModelId = new Map(
            actionResources.map((a) => [a.id, a])
          );

          await concurrentExecutor(
            items,
            async (item) => {
              if (isMigratedPath(item.contentGcsPath)) {
                skipped += 1;
                return;
              }

              const action = actionByModelId.get(item.agentMCPActionId);
              if (!action) {
                // Orphan output item. The action it belongs to was deleted but this row wasn't
                // (FK cascade should prevent this, log and skip).
                scriptLogger.error(
                  {
                    workspaceId: workspaceId,
                    itemId: item.id,
                    agentMCPActionId: item.agentMCPActionId,
                  },
                  "[Backfill MCP output GCS paths] Orphan item with no action; skipping"
                );
                errors += 1;
                return;
              }

              const oldPath = item.contentGcsPath;

              if (!execute) {
                return;
              }

              // Re-write content from DB to the new GCS path. The DB column is NOT NULL during the
              // migration period, so it's available even for items that already have a
              // (legacy-prefix) GCS object.
              const writeResult = await rewriteContentToGcs(auth, action, item);
              if (writeResult.isErr()) {
                scriptLogger.error(
                  {
                    workspaceId: workspaceId,
                    itemId: item.id,
                    err: writeResult.error.message,
                  },
                  "[Backfill MCP output GCS paths] GCS write failed; skipping item"
                );
                errors += 1;
                return;
              }

              await AgentMCPActionOutputItemModel.update(
                { contentGcsPath: writeResult.value },
                {
                  where: { id: item.id, workspaceId: workspaceModelId },
                  silent: true,
                }
              );

              // Best-effort cleanup of the legacy object. Do not fail the row if delete errors
              // The new path is already authoritative.
              if (deleteOldGcs && oldPath && !isMigratedPath(oldPath)) {
                try {
                  await bucket.delete(oldPath, { ignoreNotFound: true });
                } catch (err) {
                  logger.error(
                    {
                      workspaceId: workspaceId,
                      itemId: item.id,
                      oldPath,
                      err: normalizeError(err),
                    },
                    "[Backfill MCP output GCS paths] Failed to delete legacy GCS object"
                  );
                }
              }

              migrated += 1;
            },
            { concurrency }
          );

          scriptLogger.info(
            {
              workspaceId: workspaceId,
              lastId,
              migrated,
              skipped,
              errors,
              execute,
            },
            execute
              ? "[Backfill MCP output GCS paths] Batch processed"
              : "[Backfill MCP output GCS paths] [DRY RUN] Batch processed"
          );
        }

        scriptLogger.info(
          { workspaceId: workspaceId, migrated, skipped, errors, execute },
          "[Backfill MCP output GCS paths] Workspace done"
        );
      },
      { wId: workspaceId, fromWorkspaceId }
    );

    scriptLogger.info("[Backfill MCP output GCS paths] All workspaces done.");
  }
);
