import { Authenticator } from "@app/lib/auth";
import { AgentMCPActionOutputItemModel } from "@app/lib/models/agent/actions/mcp";
import { MCP_OUTPUT_ITEMS_PREFIX } from "@app/lib/resources/agent_mcp_action/output_storage";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId } from "@app/types/shared/model_id";
import type { LightWorkspaceType } from "@app/types/user";
import { Op } from "sequelize";
import { z } from "zod";

// Requires a verified GCS backfill.
const CONTENT_PLACEHOLDER = {
  type: "text" as const,
  text: "Output content unavailable.",
};

export async function clearMCPActionOutputItemContents(
  {
    workspace,
    batchSize,
    afterId,
    execute,
  }: {
    workspace: LightWorkspaceType;
    batchSize: number;
    afterId: ModelId;
    execute: boolean;
  },
  logger: Logger
) {
  z.number().int().positive().parse(batchSize);
  z.number().int().nonnegative().parse(afterId);

  const prefix = `w/${workspace.sId}/${MCP_OUTPUT_ITEMS_PREFIX}/`;
  let lastId = afterId;
  let scanned = 0;
  let eligible = 0;
  let updated = 0;

  while (true) {
    const items = await AgentMCPActionOutputItemModel.findAll({
      attributes: ["id", "contentGcsPath"],
      where: { workspaceId: workspace.id, id: { [Op.gt]: lastId } },
      order: [["id", "ASC"]],
      limit: batchSize,
      raw: true,
    });
    if (items.length === 0) {
      break;
    }

    const itemIds = items
      .filter((item) => item.contentGcsPath?.startsWith(prefix))
      .map((item) => item.id);

    if (execute && itemIds.length > 0) {
      const [affectedCount] = await AgentMCPActionOutputItemModel.update(
        { content: CONTENT_PLACEHOLDER },
        {
          where: {
            workspaceId: workspace.id,
            id: { [Op.in]: itemIds },
            contentGcsPath: { [Op.startsWith]: prefix },
          },
          silent: true,
        }
      );
      updated += affectedCount;
    }

    // Advance the cursor after a successful update.
    lastId = items[items.length - 1].id;
    scanned += items.length;
    eligible += itemIds.length;
    logger.info(
      {
        workspaceId: workspace.sId,
        lastId,
        scanned,
        eligible,
        skipped: scanned - eligible,
        updated,
        execute,
      },
      "[Clear MCP output contents] Batch complete"
    );
  }

  return { lastId, scanned, eligible, skipped: scanned - eligible, updated };
}

if (process.argv[1]?.endsWith("clear_mcp_action_output_item_contents.ts")) {
  makeScript(
    {
      workspaceId: { type: "string", demandOption: true },
      batchSize: { type: "number", default: 1000 },
      afterId: {
        type: "number",
        default: 0,
        describe: "Resume after the last successfully processed output item ID",
      },
    },
    async ({ workspaceId, batchSize, afterId, execute }, logger) => {
      const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
      const result = await clearMCPActionOutputItemContents(
        {
          workspace: auth.getNonNullableWorkspace(),
          batchSize,
          afterId,
          execute,
        },
        logger
      );
      logger.info(
        { workspaceId, ...result, execute },
        "[Clear MCP output contents] Done"
      );
    }
  );
}
