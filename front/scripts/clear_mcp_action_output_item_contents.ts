import { Authenticator } from "@app/lib/auth";
import { AgentMCPActionOutputItemModel } from "@app/lib/models/agent/actions/mcp";
import { MCP_OUTPUT_ITEMS_PREFIX } from "@app/lib/resources/agent_mcp_action/output_storage";
import { makeScript } from "@app/scripts/helpers";
import { Op } from "sequelize";
import { z } from "zod";

// Requires a verified GCS backfill.
const CONTENT_PLACEHOLDER = {
  type: "text" as const,
  text: "Output content unavailable.",
};

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
    z.number().int().positive().parse(batchSize);
    z.number().int().nonnegative().parse(afterId);

    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
    const workspace = auth.getNonNullableWorkspace();
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
            dangerouslyByPassAppendOnlyRule: true,
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
          workspaceId,
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

    logger.info(
      {
        workspaceId,
        lastId,
        scanned,
        eligible,
        skipped: scanned - eligible,
        updated,
        execute,
      },
      "[Clear MCP output contents] Done"
    );
  }
);
