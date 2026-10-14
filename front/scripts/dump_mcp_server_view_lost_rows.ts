/**
 * Dump the rows that hard-deleting MCP server views removed, from a copy of the front database
 * taken before the deletion. Run it with `FRONT_DATABASE_URI` pointing at that copy, then feed the
 * output directory to the restore script on production.
 *
 * Usage:
 *   npx tsx scripts/dump_mcp_server_view_lost_rows.ts \
 *     --workspaceId <sId> \
 *     (--mcpServerId <sId> | --mcpServerViewIds <sId> ...) \
 *     [--outputDir <dir>]
 *
 * `--mcpServerId` targets every view of that server in a regular space, which sharing the server
 * to the global space deletes. `--mcpServerViewIds` targets the given views, which must all belong
 * to one server.
 *
 * Writes one CSV per table (`id`, `row`: the full database row as JSON) and a `manifest.json`.
 */

import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import { ConversationMCPServerViewModel } from "@app/lib/models/agent/actions/conversation_mcp_server_view";
import { AgentDataSourceConfigurationModel } from "@app/lib/models/agent/actions/data_sources";
import {
  AgentChildAgentConfigurationModel,
  AgentMCPServerConfigurationModel,
} from "@app/lib/models/agent/actions/mcp";
import { MCPServerViewModel } from "@app/lib/models/agent/actions/mcp_server_view";
import { AgentTablesQueryConfigurationTableModel } from "@app/lib/models/agent/actions/tables_query";
import { SkillMCPServerConfigurationModel } from "@app/lib/models/skill";
import { frontSequelize } from "@app/lib/resources/storage";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId } from "@app/types/shared/model_id";
import assert from "assert";
import { stringify } from "csv-stringify/sync";
import { format } from "date-fns";
import fs from "fs";
import uniq from "lodash/uniq";
import path from "path";
import { QueryTypes } from "sequelize";

type DumpedRow = { id: ModelId; row: Record<string, unknown> };

async function findLostViews(
  workspaceModelId: ModelId,
  {
    mcpServerId,
    mcpServerViewIds,
  }: { mcpServerId: string | undefined; mcpServerViewIds: string[] }
): Promise<MCPServerViewModel[]> {
  if (mcpServerViewIds.length > 0) {
    const ids = mcpServerViewIds.map((sId) => {
      const id = getResourceIdFromSId(sId);
      assert(id !== null, `Invalid MCP server view sId: ${sId}`);
      return id;
    });
    return MCPServerViewModel.findAll({
      where: { workspaceId: workspaceModelId, id: ids },
    });
  }

  assert(mcpServerId, "Pass either --mcpServerId or --mcpServerViewIds");
  const { serverType, id } = getServerTypeAndIdFromSId(mcpServerId);
  const views = await MCPServerViewModel.findAll({
    where:
      serverType === "internal"
        ? { workspaceId: workspaceModelId, internalMCPServerId: mcpServerId }
        : { workspaceId: workspaceModelId, remoteMCPServerId: id },
  });
  const regularSpaces = await SpaceModel.findAll({
    attributes: ["id"],
    where: {
      workspaceId: workspaceModelId,
      id: uniq(views.map((view) => view.vaultId)),
      kind: "regular",
    },
  });
  const regularSpaceIds = new Set(regularSpaces.map((space) => space.id));
  return views.filter((view) => regularSpaceIds.has(view.vaultId));
}

// Rows are read as `row_to_json` so every column comes along, including ones a model omits, with
// nulls, arrays and JSON values kept as they are.
async function selectRows(
  tableName: string,
  column: "mcpServerViewId" | "mcpServerConfigurationId",
  workspaceModelId: ModelId,
  ids: ModelId[]
): Promise<DumpedRow[]> {
  if (ids.length === 0) {
    return [];
  }
  // oxlint-disable-next-line dust/noRawSql -- copies full rows, including columns the models omit.
  const rows = await frontSequelize.query<{ row: Record<string, unknown> }>(
    `SELECT row_to_json(t) AS row FROM "${tableName}" t WHERE t."workspaceId" = :workspaceModelId AND t."${column}" IN (:ids) ORDER BY t.id`,
    { replacements: { workspaceModelId, ids }, type: QueryTypes.SELECT }
  );
  return rows.map(({ row }) => {
    assert(
      typeof row.id === "number",
      `Row without a numeric id in ${tableName}`
    );
    return { id: row.id, row };
  });
}

/**
 * @cc [owner:avervaet,label:backend] read-only
 * MUST NOT write to the database it reads, so it can run against a production copy without
 * changing anything.
 */
async function dumpLostRows(
  workspaceModelId: ModelId,
  viewIds: ModelId[]
): Promise<Record<string, DumpedRow[]>> {
  const agentConfigurations = await selectRows(
    AgentMCPServerConfigurationModel.tableName,
    "mcpServerViewId",
    workspaceModelId,
    viewIds
  );
  const configurationIds = agentConfigurations.map((r) => r.id);

  return {
    [AgentMCPServerConfigurationModel.tableName]: agentConfigurations,
    [AgentDataSourceConfigurationModel.tableName]: await selectRows(
      AgentDataSourceConfigurationModel.tableName,
      "mcpServerConfigurationId",
      workspaceModelId,
      configurationIds
    ),
    [AgentTablesQueryConfigurationTableModel.tableName]: await selectRows(
      AgentTablesQueryConfigurationTableModel.tableName,
      "mcpServerConfigurationId",
      workspaceModelId,
      configurationIds
    ),
    [AgentChildAgentConfigurationModel.tableName]: await selectRows(
      AgentChildAgentConfigurationModel.tableName,
      "mcpServerConfigurationId",
      workspaceModelId,
      configurationIds
    ),
    [SkillMCPServerConfigurationModel.tableName]: await selectRows(
      SkillMCPServerConfigurationModel.tableName,
      "mcpServerViewId",
      workspaceModelId,
      viewIds
    ),
    [ConversationMCPServerViewModel.tableName]: await selectRows(
      ConversationMCPServerViewModel.tableName,
      "mcpServerViewId",
      workspaceModelId,
      viewIds
    ),
  };
}

makeScript(
  {
    workspaceId: {
      type: "string",
      demandOption: true,
      describe: "The workspace sId",
    },
    mcpServerId: {
      type: "string",
      describe:
        "sId of the MCP server whose regular-space views were deleted (global share)",
    },
    mcpServerViewIds: {
      type: "array",
      default: [],
      describe: "sIds of the deleted MCP server views",
    },
    outputDir: {
      type: "string",
      describe: "Directory to write the dump to (created if missing)",
    },
  },
  async ({ workspaceId, mcpServerId, mcpServerViewIds, outputDir }, logger) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    assert(workspace, `Workspace not found: ${workspaceId}`);

    const views = await findLostViews(workspace.id, {
      mcpServerId,
      mcpServerViewIds: mcpServerViewIds.map(String),
    });
    assert(
      views.length > 0,
      "No matching MCP server view: is this database copy older than the deletion?"
    );
    const servers = uniq(
      views.map((v) => `${v.internalMCPServerId}:${v.remoteMCPServerId}`)
    );
    assert(servers.length === 1, "The views must all belong to one server");

    const rowsByTable = await dumpLostRows(
      workspace.id,
      views.map((v) => v.id)
    );

    const dir =
      outputDir ??
      `${format(new Date(), "yyyy-MM-dd_HHmmss")}_${workspaceId}_mcp_server_view_lost_rows`;
    fs.mkdirSync(dir, { recursive: true });
    for (const [tableName, rows] of Object.entries(rowsByTable)) {
      fs.writeFileSync(
        path.join(dir, `${tableName}.csv`),
        stringify(
          rows.map((r) => ({ id: r.id, row: JSON.stringify(r.row) })),
          { header: true, columns: ["id", "row"] }
        )
      );
    }

    const counts = Object.fromEntries(
      Object.entries(rowsByTable).map(([tableName, rows]) => [
        tableName,
        rows.length,
      ])
    );
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify(
        {
          dumpedAt: new Date().toISOString(),
          workspaceId,
          workspaceModelId: workspace.id,
          internalMCPServerId: views[0].internalMCPServerId,
          remoteMCPServerId: views[0].remoteMCPServerId,
          lostViewIds: views.map((v) => v.id),
          counts,
        },
        null,
        2
      )
    );

    logger.info(
      { dir, lostViewIds: views.map((v) => v.id), counts },
      "Dump written"
    );
  }
);
