import { getCitationsFromToolOutput } from "@app/lib/api/assistant/citations";
import { Authenticator } from "@app/lib/auth";
import {
  AgentMCPActionModel,
  AgentMCPActionOutputItemModel,
} from "@app/lib/models/agent/actions/mcp";
import { batchFetchContentsFromGcs } from "@app/lib/resources/agent_mcp_action/output_storage";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { ModelId } from "@app/types/shared/model_id";
import { removeNulls } from "@app/types/shared/utils/general";
import { Op } from "sequelize";

import { makeScript } from "./helpers";

const BATCH_SIZE_DEFAULT = 500;
const ACTION_IDS_CHUNK_SIZE = 5_000;

function chunkArray<T>(arr: T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error("chunkArray size must be > 0");
  }
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

makeScript(
  {
    batchSize: {
      type: "number",
      default: BATCH_SIZE_DEFAULT,
      describe: "Number of output items to process per batch per workspace",
    },
    concurrency: {
      type: "number",
      default: 2,
      describe: "Concurrent item updates per batch",
    },
  },
  async ({ execute, batchSize, concurrency }, logger) => {
    const workspaces = await WorkspaceResource.listAll();

    logger.info(
      { candidateWorkspaceCount: workspaces.length },
      "[Backfill MCP output citations] Found workspaces with citationsAllocated > 0"
    );

    for (const workspace of workspaces) {
      const workspaceId = workspace.sId;
      const workspaceModelId = workspace.id;

      logger.info(
        { workspaceId, workspaceModelId, batchSize, execute },
        "[Backfill MCP output citations] Starting workspace"
      );

      const auth = await Authenticator.internalBuilderForWorkspace(workspaceId);

      const actionRows = await AgentMCPActionModel.findAll({
        attributes: ["id"],
        where: {
          workspaceId: workspaceModelId,
          citationsAllocated: { [Op.gt]: 0 },
        },
        raw: true,
      });

      const actionIds = actionRows.map((r) => r.id);
      if (actionIds.length === 0) {
        logger.info(
          { workspaceId },
          "[Backfill MCP output citations] No actions with citationsAllocated > 0; skipping workspace"
        );
        continue;
      }

      const actionIdChunks = chunkArray(actionIds, ACTION_IDS_CHUNK_SIZE);
      logger.info(
        {
          workspaceId,
          actionCount: actionIds.length,
          chunkCount: actionIdChunks.length,
        },
        "[Backfill MCP output citations] Found actions with citationsAllocated > 0"
      );

      for (const [chunkIdx, chunkActionIds] of actionIdChunks.entries()) {
        let lastId: ModelId | null = null;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const whereBase: Record<string, unknown> = {
            workspaceId: workspaceModelId,
            citations: null,
            agentMCPActionId: {
              [Op.in]: chunkActionIds,
            },
          };
          if (lastId !== null) {
            whereBase.id = { [Op.gt]: lastId };
          }

          // Split query to avoid fetching large JSONB `content` for GCS-backed rows.
          const [gcsItems, legacyItems] = await Promise.all([
            AgentMCPActionOutputItemModel.findAll({
              attributes: { exclude: ["content"] },
              where: { ...whereBase, contentGcsPath: { [Op.ne]: null } },
              order: [["id", "ASC"]],
              limit: batchSize,
            }),
            AgentMCPActionOutputItemModel.findAll({
              where: { ...whereBase, contentGcsPath: null },
              order: [["id", "ASC"]],
              limit: batchSize,
            }),
          ]);

          const items = [...gcsItems, ...legacyItems].sort(
            (a, b) => a.id - b.id
          );

          if (items.length === 0) {
            break;
          }

          lastId = items[items.length - 1].id;

          const gcsToHydrate = removeNulls(
            items
              .filter((i) => i.contentGcsPath)
              .map((i) => ({
                itemId: i.id,
                gcsPath: i.contentGcsPath!,
              }))
          );

          if (gcsToHydrate.length > 0) {
            const contentResult = await batchFetchContentsFromGcs(
              auth,
              gcsToHydrate
            );
            if (contentResult.isOk()) {
              for (const item of items) {
                if (item.contentGcsPath) {
                  const hydrated = contentResult.value.get(item.id);
                  if (hydrated) {
                    item.content = hydrated;
                  }
                }
              }
            } else {
              logger.error(
                {
                  workspaceId,
                  chunkIdx,
                  error: contentResult.error.message,
                },
                "[Backfill MCP output citations] Failed to hydrate GCS-backed output items; skipping batch"
              );
              continue;
            }
          }

          let updated = 0;
          await concurrentExecutor(
            items,
            async (item) => {
              const citations = getCitationsFromToolOutput([item.content]);

              if (execute) {
                await AgentMCPActionOutputItemModel.update(
                  { citations },
                  { where: { id: item.id, workspaceId: workspaceModelId } }
                );
              }
              updated += 1;
            },
            { concurrency }
          );

          logger.info(
            { workspaceId, chunkIdx, lastId, updated, execute },
            execute
              ? "[Backfill MCP output citations] Updated batch"
              : "[Backfill MCP output citations] [DRY RUN] Would update batch"
          );
        }
      }

      logger.info(
        { workspaceId, execute },
        "[Backfill MCP output citations] Completed workspace"
      );
    }

    logger.info("[Backfill MCP output citations] Done.");
  }
);
