import type { MCPToolType } from "@app/lib/api/mcp";
import { RemoteMCPServerModel } from "@app/lib/models/agent/actions/remote_mcp_server";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { mcpToolsRequireConfiguration } from "@app/lib/utils/json_schemas";
import { makeScript } from "@app/scripts/helpers";
import { Op } from "sequelize";

const BATCH_SIZE = 256;

// Backfill `cachedToolsRequireConfiguration` from `cachedTools` for rows written before the
// column existed (they carry the column default, `false`). Run once all pods double-write the
// column on every `cachedTools` write (RemoteMCPServerResource.makeNew / updateMetadata), so no
// row can be written the old way afterwards. Safe to re-run: recomputing is idempotent.
makeScript({}, async ({ execute }, logger) => {
  const RemoteMCPServerModelWithBypass: ModelStaticWorkspaceAware<RemoteMCPServerModel> =
    RemoteMCPServerModel;

  let lastId = 0;
  let scanned = 0;
  let mismatched = 0;

  for (;;) {
    const servers = await RemoteMCPServerModelWithBypass.findAll({
      where: { id: { [Op.gt]: lastId } },
      attributes: [
        "id",
        "workspaceId",
        "cachedTools",
        "cachedToolsRequireConfiguration",
      ],
      order: [["id", "ASC"]],
      limit: BATCH_SIZE,
      // WORKSPACE_ISOLATION_BYPASS: Migration script backfills the flag across all workspaces.
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });

    if (servers.length === 0) {
      break;
    }
    lastId = servers[servers.length - 1].id;
    scanned += servers.length;

    for (const server of servers) {
      // Old rows can hold a NULL cachedTools despite the model type (column is nullable).
      const cachedTools: MCPToolType[] | null = server.cachedTools;
      const requireConfiguration = mcpToolsRequireConfiguration(
        cachedTools ?? []
      );

      if (requireConfiguration === server.cachedToolsRequireConfiguration) {
        continue;
      }
      mismatched++;

      logger.info(
        {
          remoteMCPServerModelId: server.id,
          workspaceId: server.workspaceId,
          requireConfiguration,
        },
        execute
          ? "Backfilling cachedToolsRequireConfiguration"
          : "Would backfill cachedToolsRequireConfiguration"
      );

      if (execute) {
        // `silent` leaves updatedAt untouched.
        await RemoteMCPServerModel.update(
          { cachedToolsRequireConfiguration: requireConfiguration },
          {
            where: { id: server.id, workspaceId: server.workspaceId },
            silent: true,
          }
        );
      }
    }
  }

  logger.info(
    { scanned, mismatched, execute },
    "Completed cachedToolsRequireConfiguration backfill"
  );
});
