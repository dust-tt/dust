import { Authenticator } from "@app/lib/auth";
import { AgentMCPActionOutputItemModel } from "@app/lib/models/agent/actions/mcp";
import { MCP_OUTPUT_ITEMS_PREFIX } from "@app/lib/resources/agent_mcp_action/output_storage";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId } from "@app/types/shared/model_id";
import type { LightWorkspaceType } from "@app/types/user";
import { Op } from "sequelize";
import { z } from "zod";

// Run backfill_mcp_action_output_item_gcs_paths.ts and verify its completion first.
// This script trusts the backfilled paths; it does not make a GCS request per row.
// GCS read failures will fall back to this placeholder instead of the original content.
const CONTENT_PLACEHOLDER = {
  type: "text" as const,
  text: "Output content unavailable.",
};

/**
 * @cc [owner:flvndvd,label:backend] clear-only-workspace-gcs-backed-content
 * The caller MUST verify the GCS backfill before executing. Only content on rows in the
 * requested workspace with its canonical MCP output GCS prefix may be replaced; other
 * columns and rows without that prefix MUST remain unchanged.
 */
/**
 * @cc [owner:flvndvd,label:performance] bounded-content-cleanup
 * Each scan MUST use the workspace/id cursor, fetch at most batchSize rows without their
 * content, and advance past ineligible rows. Updates MUST be batched, not per row.
 */
/**
 * @cc [owner:flvndvd,label:backend] content-cleanup-dry-run
 * When execute is false, no database rows may be changed.
 */
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

    // Log the cursor only after the update succeeds so --afterId can resume safely.
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
