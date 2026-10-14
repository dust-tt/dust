/**
 * Restore the rows dumped by the MCP server view lost-rows dump into production, re-pointed at a
 * live view of the same server (by default its global-space view).
 *
 * Usage:
 *   npx tsx scripts/restore_mcp_server_view_lost_rows.ts \
 *     --inputDir <dump dir> \
 *     [--destinationMcpServerViewId <sId>] \
 *     [--execute]
 *
 * Without `--execute`, everything is inserted in a transaction that is rolled back, so the counts
 * show what a real run would restore. With it, the transaction commits and a revert SQL file and
 * the restored active agent sIds are written to the input directory.
 */

import { ConversationMCPServerViewModel } from "@app/lib/models/agent/actions/conversation_mcp_server_view";
import { AgentDataSourceConfigurationModel } from "@app/lib/models/agent/actions/data_sources";
import {
  AgentChildAgentConfigurationModel,
  AgentMCPServerConfigurationModel,
} from "@app/lib/models/agent/actions/mcp";
import { MCPServerViewModel } from "@app/lib/models/agent/actions/mcp_server_view";
import { AgentTablesQueryConfigurationTableModel } from "@app/lib/models/agent/actions/tables_query";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import {
  SkillConfigurationModel,
  SkillMCPServerConfigurationModel,
} from "@app/lib/models/skill";
import { invalidateAgentResourceCaches } from "@app/lib/resources/agent_resource_cache";
import { launchAgentSearchIndexation } from "@app/lib/resources/agent_resource_indexation";
import { frontSequelize } from "@app/lib/resources/storage";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId } from "@app/types/shared/model_id";
import assert from "assert";
import { parse } from "csv-parse/sync";
import fs from "fs";
import chunk from "lodash/chunk";
import uniq from "lodash/uniq";
import path from "path";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";
import { z } from "zod";

const ManifestSchema = z.object({
  workspaceId: z.string(),
  workspaceModelId: z.number(),
  internalMCPServerId: z.string().nullable(),
  remoteMCPServerId: z.number().nullable(),
  lostViewModelIds: z.array(z.number()),
});
type Manifest = z.infer<typeof ManifestSchema>;

const RowSchema = z
  .object({ id: z.number(), workspaceId: z.number() })
  .catchall(z.unknown());
type Row = z.infer<typeof RowSchema>;

const CsvRecordSchema = z.object({ id: z.string(), row: z.string() });

const INSERT_BATCH_SIZE = 500;

// Parents first: a link row is only restored when its parent exists in production.
const TABLES: {
  tableName: string;
  parentTable: string;
  parentColumn: string;
  repointView: boolean;
  skipConflicts: boolean;
  // Columns that identify an equivalent link; a row is skipped when one already exists.
  skipExistingOn?: string[];
}[] = [
  {
    tableName: AgentMCPServerConfigurationModel.tableName,
    parentTable: AgentConfigurationModel.tableName,
    parentColumn: "agentConfigurationId",
    repointView: true,
    skipConflicts: false,
  },
  {
    tableName: AgentDataSourceConfigurationModel.tableName,
    parentTable: AgentMCPServerConfigurationModel.tableName,
    parentColumn: "mcpServerConfigurationId",
    repointView: false,
    skipConflicts: false,
  },
  {
    tableName: AgentTablesQueryConfigurationTableModel.tableName,
    parentTable: AgentMCPServerConfigurationModel.tableName,
    parentColumn: "mcpServerConfigurationId",
    repointView: false,
    skipConflicts: false,
  },
  {
    tableName: AgentChildAgentConfigurationModel.tableName,
    parentTable: AgentMCPServerConfigurationModel.tableName,
    parentColumn: "mcpServerConfigurationId",
    repointView: false,
    skipConflicts: false,
  },
  {
    // Skills are edited in place and have no unique index on their links, so a tool re-added
    // by hand since the deletion would otherwise be duplicated.
    tableName: SkillMCPServerConfigurationModel.tableName,
    parentTable: SkillConfigurationModel.tableName,
    parentColumn: "skillConfigurationId",
    repointView: true,
    skipConflicts: false,
    skipExistingOn: ["skillConfigurationId", "mcpServerViewId"],
  },
  {
    // A conversation may already have the destination view added by hand since the deletion.
    tableName: ConversationMCPServerViewModel.tableName,
    parentTable: ConversationModel.tableName,
    parentColumn: "conversationId",
    repointView: true,
    skipConflicts: true,
  },
];

function readRows(inputDir: string, tableName: string): Row[] {
  const file = path.join(inputDir, `${tableName}.csv`);
  assert(fs.existsSync(file), `Missing dump file: ${file}`);
  const records = z
    .array(CsvRecordSchema)
    .parse(parse(fs.readFileSync(file), { columns: true }));
  return records.map((record) => RowSchema.parse(JSON.parse(record.row)));
}

async function findDestinationView(
  manifest: Manifest,
  destinationMcpServerViewId: string | undefined
): Promise<MCPServerViewModel> {
  const sameServer = {
    workspaceId: manifest.workspaceModelId,
    internalMCPServerId: manifest.internalMCPServerId,
    remoteMCPServerId: manifest.remoteMCPServerId,
  };

  if (destinationMcpServerViewId) {
    const id = getResourceIdFromSId(destinationMcpServerViewId);
    assert(
      id !== null,
      `Invalid MCP server view sId: ${destinationMcpServerViewId}`
    );
    const view = await MCPServerViewModel.findOne({
      where: { ...sameServer, id },
    });
    assert(view, "Destination view not found for this workspace and server");
    const space = await SpaceModel.findOne({
      attributes: ["id", "kind"],
      where: { workspaceId: manifest.workspaceModelId, id: view.vaultId },
    });
    assert(
      space && (space.kind === "global" || space.kind === "regular"),
      "Destination view must be in a global or regular space"
    );
    return view;
  }

  const globalSpace = await SpaceModel.findOne({
    attributes: ["id"],
    where: { workspaceId: manifest.workspaceModelId, kind: "global" },
  });
  assert(globalSpace, "Global space not found");
  const views = await MCPServerViewModel.findAll({
    where: { ...sameServer, vaultId: globalSpace.id },
  });
  assert(
    views.length === 1,
    `Expected one global-space view of the server, found ${views.length}`
  );
  return views[0];
}

async function insertRows(
  {
    tableName,
    parentTable,
    parentColumn,
    skipConflicts,
    skipExistingOn,
  }: (typeof TABLES)[number],
  rows: Row[],
  transaction: Transaction
): Promise<ModelId[]> {
  const insertedIds: ModelId[] = [];
  const skipExistingClause = skipExistingOn
    ? `AND NOT EXISTS (SELECT 1 FROM "${tableName}" e WHERE ${skipExistingOn
        .map((column) => `e."${column}" = r."${column}"`)
        .join(" AND ")})`
    : "";
  for (const batch of chunk(rows, INSERT_BATCH_SIZE)) {
    // oxlint-disable-next-line dust/noRawSql -- restores full rows by column name, including columns the models omit.
    const [inserted] = await frontSequelize.query(
      `INSERT INTO "${tableName}"
       SELECT r.* FROM json_populate_recordset(NULL::"${tableName}", :rows::json) r
       WHERE EXISTS (SELECT 1 FROM "${parentTable}" p WHERE p.id = r."${parentColumn}")
       ${skipExistingClause}
       ${skipConflicts ? "ON CONFLICT DO NOTHING" : ""}
       RETURNING id`,
      { replacements: { rows: JSON.stringify(batch) }, transaction }
    );
    insertedIds.push(
      ...z
        .array(z.object({ id: z.number() }))
        .parse(inserted)
        .map((r) => r.id)
    );
  }
  return insertedIds;
}

/**
 * @cc [owner:avervaet,label:backend] restore-repoints-only-the-view
 * A restored row MUST keep every dumped column except `mcpServerViewId`, which MUST be the
 * destination view on tables that reference a view, and MUST belong to the manifest's workspace.
 * Without `execute`, nothing MUST be committed.
 */
async function restoreRows(
  manifest: Manifest,
  destinationView: MCPServerViewModel,
  rowsByTable: Map<string, Row[]>,
  execute: boolean,
  logger: Logger
): Promise<Map<string, ModelId[]>> {
  const insertedByTable = new Map<string, ModelId[]>();
  const transaction = await frontSequelize.transaction();
  try {
    for (const table of TABLES) {
      const rows = (rowsByTable.get(table.tableName) ?? []).map((row) => {
        assert(
          row.workspaceId === manifest.workspaceModelId,
          `Row ${row.id} of ${table.tableName} belongs to another workspace`
        );
        return table.repointView
          ? { ...row, mcpServerViewId: destinationView.id }
          : row;
      });
      const insertedIds = await insertRows(table, rows, transaction);
      insertedByTable.set(table.tableName, insertedIds);
      logger.info(
        {
          table: table.tableName,
          dumped: rows.length,
          restored: insertedIds.length,
        },
        execute ? "Restored" : "Would restore (dry run)"
      );
    }

    if (execute) {
      await transaction.commit();
    } else {
      await transaction.rollback();
    }
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
  return insertedByTable;
}

makeScript(
  {
    inputDir: {
      type: "string",
      demandOption: true,
      describe: "Directory written by the dump script",
    },
    destinationMcpServerViewId: {
      type: "string",
      describe:
        "sId of the view to re-point rows at (default: the server's global-space view)",
    },
  },
  async ({ inputDir, destinationMcpServerViewId, execute }, logger) => {
    const manifest = ManifestSchema.parse(
      JSON.parse(fs.readFileSync(path.join(inputDir, "manifest.json"), "utf8"))
    );

    const workspace = await WorkspaceResource.fetchById(manifest.workspaceId);
    assert(workspace, `Workspace not found: ${manifest.workspaceId}`);
    assert(
      workspace.id === manifest.workspaceModelId,
      "The workspace model id differs from the dump's"
    );

    const destinationView = await findDestinationView(
      manifest,
      destinationMcpServerViewId
    );

    const rowsByTable = new Map(
      TABLES.map(({ tableName }) => [tableName, readRows(inputDir, tableName)])
    );

    const agentMcpRows =
      rowsByTable.get(AgentMCPServerConfigurationModel.tableName) ?? [];
    const alreadyRestored = await AgentMCPServerConfigurationModel.count({
      where: {
        workspaceId: manifest.workspaceModelId,
        [Op.or]: [
          { id: agentMcpRows.map((r) => r.id) },
          { sId: agentMcpRows.map((r) => String(r.sId)) },
        ],
      },
    });
    assert(
      alreadyRestored === 0,
      `${alreadyRestored} agent tool rows already exist: already restored?`
    );

    logger.info(
      {
        destinationViewId: destinationView.id,
        lostViewModelIds: manifest.lostViewModelIds,
      },
      "Restoring"
    );

    const insertedByTable = await restoreRows(
      manifest,
      destinationView,
      rowsByTable,
      execute,
      logger
    );

    if (!execute) {
      return;
    }

    const insertedAgentMcpModelIds = new Set(
      insertedByTable.get(AgentMCPServerConfigurationModel.tableName) ?? []
    );
    const restoredAgentConfigurations = await AgentConfigurationModel.findAll({
      attributes: ["sId", "status"],
      where: {
        workspaceId: manifest.workspaceModelId,
        id: uniq(
          agentMcpRows
            .filter((r) => insertedAgentMcpModelIds.has(r.id))
            .map((r) => Number(r.agentConfigurationId))
        ),
      },
    });
    const agentIds = uniq(restoredAgentConfigurations.map((a) => a.sId));

    // Restored tools change the agents' search documents.
    await invalidateAgentResourceCaches(manifest.workspaceModelId, agentIds);
    await launchAgentSearchIndexation(manifest.workspaceId, agentIds);

    const revert = [
      "BEGIN;",
      ...[...TABLES].reverse().flatMap(({ tableName }) => {
        const ids = insertedByTable.get(tableName) ?? [];
        return ids.length > 0
          ? [`DELETE FROM "${tableName}" WHERE id IN (${ids.join(",")});`]
          : [];
      }),
      "COMMIT;",
    ].join("\n");
    fs.writeFileSync(path.join(inputDir, "restore_revert.sql"), revert);
    fs.writeFileSync(
      path.join(inputDir, "restored_active_agent_ids.txt"),
      uniq(
        restoredAgentConfigurations
          .filter((a) => a.status === "active")
          .map((a) => a.sId)
      ).join(" ")
    );

    logger.info(
      { inputDir, restoredAgentCount: agentIds.length },
      "Restore committed: revert file and agent ids written"
    );
  }
);
