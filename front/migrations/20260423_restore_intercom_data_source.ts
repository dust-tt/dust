// Reconcile a workspace's Intercom data source that was accidentally deleted
// and re-created. The deletion cascaded (via app-level cleanup) through all
// FK-attached configuration rows. The user re-created the connector, so we
// now have a new DataSource (new id, new connectorId) and we restore the
// FK-attached rows from a pre-incident snapshot, rewriting Intercom parent
// strings that embed the old connectorId.
//
// Content fragments are intentionally NOT restored. Post-incident check found
// only 1 content_fragment row referenced a DSV of the lost Intercom data
// source; the fragment itself still exists, only the nodeDataSourceViewId
// pointer was nulled by the cascade. Not worth the restore complexity.

import type { Transaction } from "sequelize";
import { QueryTypes, Sequelize } from "sequelize";

import { AgentDataSourceConfigurationModel } from "@app/lib/models/agent/actions/data_sources";
import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { AgentTablesQueryConfigurationTableModel } from "@app/lib/models/agent/actions/tables_query";
import {
  SkillConfigurationModel,
  SkillDataSourceConfigurationModel,
} from "@app/lib/models/skill";
import type { Logger } from "@app/logger/logger";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { makeScript } from "@app/scripts/helpers";
import { EnvironmentConfig } from "@app/types/shared/utils/config";

// Every Intercom content node is identified by `intercom-<kind>-<connectorId>`
// optionally followed by `-<resourceId>`. See
// connectors/src/connectors/intercom/lib/utils.ts.
const INTERCOM_KIND_PREFIXES = [
  "intercom-help-center-",
  "intercom-collection-",
  "intercom-article-",
  "intercom-teams-", // all-teams folder, no trailing resource id
  "intercom-team-",
  "intercom-conversation-",
] as const;

function buildIntercomParentRewriter(
  oldConnectorId: string,
  newConnectorId: string
): (s: string) => string {
  return (s) => {
    const prefix = INTERCOM_KIND_PREFIXES.find((p) => s.startsWith(p));
    if (!prefix) {
      return s;
    }
    const afterPrefix = s.slice(prefix.length);
    // Two shapes: `<connectorId>` alone (e.g. intercom-teams-123)
    // or `<connectorId>-<resourceId...>`.
    if (afterPrefix === oldConnectorId) {
      return prefix + newConnectorId;
    }
    if (afterPrefix.startsWith(`${oldConnectorId}-`)) {
      return prefix + newConnectorId + afterPrefix.slice(oldConnectorId.length);
    }
    return s;
  };
}

type ParentsDiff = {
  before: string[] | null;
  after: string[] | null;
  changedCount: number;
};

function diffParents(
  parents: string[] | null,
  rewrite: (s: string) => string
): ParentsDiff {
  if (parents === null) {
    return { before: null, after: null, changedCount: 0 };
  }
  const after = parents.map(rewrite);
  let changedCount = 0;
  for (let i = 0; i < parents.length; i++) {
    if (parents[i] !== after[i]) {
      changedCount++;
    }
  }
  return { before: parents, after, changedCount };
}

type RestoreStats = {
  snapshotRowCount: number;
  inserted: number;
  reused: number;
  skippedOrphan: number;
  parentsRewritten: number;
};

function emptyStats(): RestoreStats {
  return {
    snapshotRowCount: 0,
    inserted: 0,
    reused: 0,
    skippedOrphan: 0,
    parentsRewritten: 0,
  };
}

async function resolveDataSource({
  sequelize,
  workspaceModelId,
  dataSourceModelId,
  label,
}: {
  sequelize: Sequelize;
  workspaceModelId: number;
  dataSourceModelId: number;
  label: string;
}): Promise<DataSourceModel> {
  const rows = await sequelize.query<DataSourceModel>(
    `
    SELECT *
    FROM data_sources
    WHERE id = :dataSourceModelId
      AND "workspaceId" = :workspaceModelId
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { dataSourceModelId, workspaceModelId },
    }
  );
  if (rows.length !== 1) {
    throw new Error(
      `Expected 1 ${label} data source (id=${dataSourceModelId}, workspaceModelId=${workspaceModelId}), got ${rows.length}.`
    );
  }
  return rows[0];
}

async function resolveWorkspaceModelId(
  sequelize: Sequelize,
  workspaceId: string
): Promise<number> {
  const rows = await sequelize.query<{ id: number }>(
    `SELECT id FROM workspaces WHERE "sId" = :sId`,
    { type: QueryTypes.SELECT, replacements: { sId: workspaceId } }
  );
  if (rows.length !== 1) {
    throw new Error(
      `Workspace not found (sId=${workspaceId}) in one of the databases`
    );
  }
  return rows[0].id;
}

async function restoreDataSourceViews({
  snapshot,
  transaction,
  logger,
  oldDs,
  newDs,
  rewrite,
  execute,
}: {
  snapshot: Sequelize;
  transaction: Transaction;
  logger: Logger;
  oldDs: DataSourceModel;
  newDs: DataSourceModel;
  rewrite: (s: string) => string;
  execute: boolean;
}): Promise<{ oldToNewDsvId: Map<number, number>; stats: RestoreStats }> {
  const snapshotDsvs = await snapshot.query<DataSourceViewModel>(
    `
    SELECT *
    FROM data_source_views
    WHERE "dataSourceId" = :oldDataSourceModelId
      AND "workspaceId" = :workspaceModelId
    `,
    {
      type: QueryTypes.SELECT,
      replacements: {
        oldDataSourceModelId: oldDs.id,
        workspaceModelId: oldDs.workspaceId,
      },
    }
  );

  const stats = emptyStats();
  stats.snapshotRowCount = snapshotDsvs.length;

  logger.info(
    { count: snapshotDsvs.length },
    "Found data_source_views in snapshot"
  );

  const oldToNewDsvId = new Map<number, number>();

  for (const snap of snapshotDsvs) {
    // Preserve snap.vaultId so DSVs that lived in other spaces (the data
    // source was shared into those spaces) get restored in place. Only the
    // auto-created default DSV in the DS's home space collides with a
    // snapshot row.
    const existing = await DataSourceViewModel.findOne({
      where: {
        workspaceId: newDs.workspaceId,
        dataSourceId: newDs.id,
        vaultId: snap.vaultId,
      },
      transaction,
    });

    if (existing && existing.kind === snap.kind) {
      const snapParentsRewritten = snap.parentsIn?.map(rewrite) ?? null;
      const existingParents = existing.parentsIn ?? null;
      const parentsMatch =
        (snapParentsRewritten === null && existingParents === null) ||
        (snapParentsRewritten !== null &&
          existingParents !== null &&
          snapParentsRewritten.length === existingParents.length &&
          snapParentsRewritten.every((p, i) => p === existingParents[i]));

      logger.info(
        {
          oldDsvId: snap.id,
          existingDsvId: existing.id,
          vaultId: snap.vaultId,
          kind: snap.kind,
          snapParentsIn: snap.parentsIn,
          existingParentsIn: existing.parentsIn,
          parentsMatch,
        },
        "Reusing existing live DSV (auto-created on re-creation of the data source)"
      );

      if (!parentsMatch) {
        logger.warn(
          {
            oldDsvId: snap.id,
            existingDsvId: existing.id,
            snapParentsIn: snap.parentsIn,
            snapParentsRewritten,
            existingParentsIn: existing.parentsIn,
          },
          "Reused DSV has different parentsIn than snapshot — snapshot state NOT restored on this DSV"
        );
      }

      oldToNewDsvId.set(snap.id, existing.id);
      stats.reused++;
      continue;
    }

    const parents = diffParents(snap.parentsIn, rewrite);
    stats.parentsRewritten += parents.changedCount;

    logger.info(
      {
        oldDsvId: snap.id,
        vaultId: snap.vaultId,
        kind: snap.kind,
        parentsInBefore: parents.before,
        parentsInAfter: parents.after,
        parentsInCount: parents.after?.length ?? 0,
        parentsRewrittenCount: parents.changedCount,
        editedByUserId: snap.editedByUserId,
        editedAt: snap.editedAt,
        createdAt: snap.createdAt,
        updatedAt: snap.updatedAt,
        deletedAt: snap.deletedAt,
        dryRun: !execute,
      },
      execute ? "Restoring DSV" : "[dry-run] Would restore DSV"
    );

    if (!execute) {
      // Placeholder mapping so downstream dry-run steps can validate that
      // every referenced DSV has a mapping entry. Negative ids make it
      // obvious in logs that these are not real live ids.
      oldToNewDsvId.set(snap.id, -snap.id);
      stats.inserted++;
      continue;
    }

    // `silent: true` prevents Sequelize from overwriting our explicit
    // `updatedAt` with `new Date()` — we want to preserve the snapshot's
    // timestamps on restored rows.
    const created = await DataSourceViewModel.create(
      {
        workspaceId: newDs.workspaceId,
        dataSourceId: newDs.id,
        vaultId: snap.vaultId,
        kind: snap.kind,
        parentsIn: parents.after,
        editedByUserId: snap.editedByUserId,
        editedAt: snap.editedAt,
        createdAt: snap.createdAt,
        updatedAt: snap.updatedAt,
        deletedAt: snap.deletedAt,
      },
      { transaction, silent: true }
    );

    logger.info(
      {
        oldDsvId: snap.id,
        newDsvId: created.id,
        vaultId: created.vaultId,
        kind: created.kind,
      },
      "Restored DSV (inserted)"
    );

    oldToNewDsvId.set(snap.id, created.id);
    stats.inserted++;
  }

  return { oldToNewDsvId, stats };
}

async function restoreAgentDataSourceConfigurations({
  snapshot,
  transaction,
  logger,
  oldDs,
  newDs,
  oldToNewDsvId,
  rewrite,
  execute,
}: {
  snapshot: Sequelize;
  transaction: Transaction;
  logger: Logger;
  oldDs: DataSourceModel;
  newDs: DataSourceModel;
  oldToNewDsvId: Map<number, number>;
  rewrite: (s: string) => string;
  execute: boolean;
}): Promise<RestoreStats> {
  const rows = await snapshot.query<AgentDataSourceConfigurationModel>(
    `
    SELECT *
    FROM agent_data_source_configurations
    WHERE "dataSourceId" = :oldDataSourceModelId
      AND "workspaceId" = :workspaceModelId
    `,
    {
      type: QueryTypes.SELECT,
      replacements: {
        oldDataSourceModelId: oldDs.id,
        workspaceModelId: oldDs.workspaceId,
      },
    }
  );

  const stats = emptyStats();
  stats.snapshotRowCount = rows.length;

  logger.info(
    { count: rows.length },
    "Found agent_data_source_configurations in snapshot"
  );

  // Pre-fetch all valid mcpServerConfigurationIds in the live DB (workspace-scoped).
  const liveMcpIds = new Set(
    (
      await AgentMCPServerConfigurationModel.findAll({
        where: { workspaceId: newDs.workspaceId },
        attributes: ["id"],
        transaction,
      })
    ).map((m) => m.id)
  );

  for (const row of rows) {
    const newDsvId = oldToNewDsvId.get(row.dataSourceViewId);
    if (newDsvId === undefined) {
      throw new Error(
        `agent_data_source_configuration ${row.id} references DSV ${row.dataSourceViewId} which has no mapping — DSV restore step missed it.`
      );
    }

    if (
      row.mcpServerConfigurationId !== null &&
      !liveMcpIds.has(row.mcpServerConfigurationId)
    ) {
      logger.warn(
        {
          snapshotRowId: row.id,
          mcpServerConfigurationId: row.mcpServerConfigurationId,
        },
        "Skipping agent_data_source_configuration: parent MCP server config no longer exists"
      );
      stats.skippedOrphan++;
      continue;
    }

    const parentsIn = diffParents(row.parentsIn, rewrite);
    const parentsNotIn = diffParents(row.parentsNotIn, rewrite);
    stats.parentsRewritten +=
      parentsIn.changedCount + parentsNotIn.changedCount;

    logger.info(
      {
        snapshotRowId: row.id,
        newDataSourceId: newDs.id,
        oldDataSourceViewId: row.dataSourceViewId,
        newDataSourceViewId: newDsvId,
        mcpServerConfigurationId: row.mcpServerConfigurationId,
        parentsInBefore: parentsIn.before,
        parentsInAfter: parentsIn.after,
        parentsInRewrittenCount: parentsIn.changedCount,
        parentsNotInBefore: parentsNotIn.before,
        parentsNotInAfter: parentsNotIn.after,
        parentsNotInRewrittenCount: parentsNotIn.changedCount,
        tagsMode: row.tagsMode,
        tagsIn: row.tagsIn,
        tagsNotIn: row.tagsNotIn,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        dryRun: !execute,
      },
      execute
        ? "Restoring agent_data_source_configuration"
        : "[dry-run] Would restore agent_data_source_configuration"
    );

    if (!execute) {
      stats.inserted++;
      continue;
    }

    const created = await AgentDataSourceConfigurationModel.create(
      {
        workspaceId: newDs.workspaceId,
        dataSourceId: newDs.id,
        dataSourceViewId: newDsvId,
        mcpServerConfigurationId: row.mcpServerConfigurationId,
        parentsIn: parentsIn.after,
        parentsNotIn: parentsNotIn.after,
        tagsMode: row.tagsMode,
        tagsIn: row.tagsIn,
        tagsNotIn: row.tagsNotIn,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      { transaction, silent: true }
    );

    logger.info(
      {
        snapshotRowId: row.id,
        newRowId: created.id,
        newDataSourceViewId: created.dataSourceViewId,
      },
      "Restored agent_data_source_configuration (inserted)"
    );
    stats.inserted++;
  }

  logger.info(stats, "Done agent_data_source_configurations");
  return stats;
}

async function restoreAgentTablesQueryConfigurationTables({
  snapshot,
  transaction,
  logger,
  oldDs,
  newDs,
  oldToNewDsvId,
  execute,
}: {
  snapshot: Sequelize;
  transaction: Transaction;
  logger: Logger;
  oldDs: DataSourceModel;
  newDs: DataSourceModel;
  oldToNewDsvId: Map<number, number>;
  execute: boolean;
}): Promise<RestoreStats> {
  // Intercom never produces tables. Included defensively; expected count: 0.
  const rows = await snapshot.query<AgentTablesQueryConfigurationTableModel>(
    `
    SELECT *
    FROM agent_tables_query_configuration_tables
    WHERE "dataSourceId" = :oldDataSourceModelId
      AND "workspaceId" = :workspaceModelId
    `,
    {
      type: QueryTypes.SELECT,
      replacements: {
        oldDataSourceModelId: oldDs.id,
        workspaceModelId: oldDs.workspaceId,
      },
    }
  );

  const stats = emptyStats();
  stats.snapshotRowCount = rows.length;

  logger.info(
    { count: rows.length },
    "Found agent_tables_query_configuration_tables in snapshot (expected 0 for Intercom)"
  );

  if (rows.length === 0) {
    return stats;
  }

  const liveMcpIds = new Set(
    (
      await AgentMCPServerConfigurationModel.findAll({
        where: { workspaceId: newDs.workspaceId },
        attributes: ["id"],
        transaction,
      })
    ).map((m) => m.id)
  );

  for (const row of rows) {
    const newDsvId = oldToNewDsvId.get(row.dataSourceViewId);
    if (newDsvId === undefined) {
      throw new Error(
        `agent_tables_query_configuration_table ${row.id} references DSV ${row.dataSourceViewId} which has no mapping.`
      );
    }
    if (!liveMcpIds.has(row.mcpServerConfigurationId)) {
      logger.warn(
        {
          snapshotRowId: row.id,
          mcpServerConfigurationId: row.mcpServerConfigurationId,
        },
        "Skipping agent_tables_query_configuration_table: parent MCP server config no longer exists"
      );
      stats.skippedOrphan++;
      continue;
    }

    logger.info(
      {
        snapshotRowId: row.id,
        tableId: row.tableId,
        oldDataSourceViewId: row.dataSourceViewId,
        newDataSourceViewId: newDsvId,
        mcpServerConfigurationId: row.mcpServerConfigurationId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        dryRun: !execute,
      },
      execute
        ? "Restoring agent_tables_query_configuration_table"
        : "[dry-run] Would restore agent_tables_query_configuration_table"
    );

    if (!execute) {
      stats.inserted++;
      continue;
    }

    const created = await AgentTablesQueryConfigurationTableModel.create(
      {
        workspaceId: newDs.workspaceId,
        dataSourceId: newDs.id,
        dataSourceViewId: newDsvId,
        mcpServerConfigurationId: row.mcpServerConfigurationId,
        tableId: row.tableId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      { transaction, silent: true }
    );

    logger.info(
      {
        snapshotRowId: row.id,
        newRowId: created.id,
        tableId: created.tableId,
      },
      "Restored agent_tables_query_configuration_table (inserted)"
    );
    stats.inserted++;
  }

  logger.info(stats, "Done agent_tables_query_configuration_tables");
  return stats;
}

async function restoreSkillDataSourceConfigurations({
  snapshot,
  transaction,
  logger,
  oldDs,
  newDs,
  oldToNewDsvId,
  rewrite,
  execute,
}: {
  snapshot: Sequelize;
  transaction: Transaction;
  logger: Logger;
  oldDs: DataSourceModel;
  newDs: DataSourceModel;
  oldToNewDsvId: Map<number, number>;
  rewrite: (s: string) => string;
  execute: boolean;
}): Promise<RestoreStats> {
  const rows = await snapshot.query<SkillDataSourceConfigurationModel>(
    `
    SELECT *
    FROM skill_data_source_configurations
    WHERE "dataSourceId" = :oldDataSourceModelId
      AND "workspaceId" = :workspaceModelId
    `,
    {
      type: QueryTypes.SELECT,
      replacements: {
        oldDataSourceModelId: oldDs.id,
        workspaceModelId: oldDs.workspaceId,
      },
    }
  );

  const stats = emptyStats();
  stats.snapshotRowCount = rows.length;

  logger.info(
    { count: rows.length },
    "Found skill_data_source_configurations in snapshot"
  );

  const liveSkillIds = new Set(
    (
      await SkillConfigurationModel.findAll({
        where: { workspaceId: newDs.workspaceId },
        attributes: ["id"],
        transaction,
      })
    ).map((s) => s.id)
  );

  for (const row of rows) {
    const newDsvId = oldToNewDsvId.get(row.dataSourceViewId);
    if (newDsvId === undefined) {
      throw new Error(
        `skill_data_source_configuration ${row.id} references DSV ${row.dataSourceViewId} which has no mapping.`
      );
    }
    if (!liveSkillIds.has(row.skillConfigurationId)) {
      logger.warn(
        {
          snapshotRowId: row.id,
          skillConfigurationId: row.skillConfigurationId,
        },
        "Skipping skill_data_source_configuration: skill_configuration no longer exists"
      );
      stats.skippedOrphan++;
      continue;
    }

    // parentsIn on this model is non-nullable (required).
    const parentsIn = diffParents(row.parentsIn, rewrite);
    stats.parentsRewritten += parentsIn.changedCount;

    logger.info(
      {
        snapshotRowId: row.id,
        skillConfigurationId: row.skillConfigurationId,
        oldDataSourceViewId: row.dataSourceViewId,
        newDataSourceViewId: newDsvId,
        parentsInBefore: parentsIn.before,
        parentsInAfter: parentsIn.after,
        parentsInCount: parentsIn.after?.length ?? 0,
        parentsRewrittenCount: parentsIn.changedCount,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        dryRun: !execute,
      },
      execute
        ? "Restoring skill_data_source_configuration"
        : "[dry-run] Would restore skill_data_source_configuration"
    );

    if (!execute) {
      stats.inserted++;
      continue;
    }

    const created = await SkillDataSourceConfigurationModel.create(
      {
        workspaceId: newDs.workspaceId,
        skillConfigurationId: row.skillConfigurationId,
        dataSourceId: newDs.id,
        dataSourceViewId: newDsvId,
        parentsIn: parentsIn.after ?? [],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      { transaction, silent: true }
    );

    logger.info(
      {
        snapshotRowId: row.id,
        newRowId: created.id,
        skillConfigurationId: created.skillConfigurationId,
        newDataSourceViewId: created.dataSourceViewId,
      },
      "Restored skill_data_source_configuration (inserted)"
    );
    stats.inserted++;
  }

  logger.info(stats, "Done skill_data_source_configurations");
  return stats;
}

makeScript(
  {
    workspaceId: {
      type: "string",
      demandOption: true,
      describe: "Workspace sId",
    },
    oldDataSourceModelId: {
      type: "number",
      demandOption: true,
      describe: "Numeric id of the deleted Intercom data source (in snapshot)",
    },
    newDataSourceModelId: {
      type: "number",
      demandOption: true,
      describe:
        "Numeric id of the re-created Intercom data source (in current DB)",
    },
  },
  async (
    { workspaceId, oldDataSourceModelId, newDataSourceModelId, execute },
    logger
  ) => {
    const snapshot = new Sequelize(
      EnvironmentConfig.getEnvVariable("FRONT_SNAPSHOT_URI"),
      { logging: false }
    );

    try {
      const liveWorkspaceModelId = await resolveWorkspaceModelId(
        frontSequelize,
        workspaceId
      );
      const snapshotWorkspaceModelId = await resolveWorkspaceModelId(
        snapshot,
        workspaceId
      );
      if (liveWorkspaceModelId !== snapshotWorkspaceModelId) {
        throw new Error(
          `Workspace ModelId mismatch between live (${liveWorkspaceModelId}) and snapshot (${snapshotWorkspaceModelId}). Aborting — cross-DB lookups by workspaceId won't be safe.`
        );
      }
      const workspaceModelId = liveWorkspaceModelId;

      const oldDs = await resolveDataSource({
        sequelize: snapshot,
        workspaceModelId,
        dataSourceModelId: oldDataSourceModelId,
        label: "old (snapshot)",
      });
      const newDs = await resolveDataSource({
        sequelize: frontSequelize,
        workspaceModelId,
        dataSourceModelId: newDataSourceModelId,
        label: "new (live)",
      });

      if (oldDs.connectorProvider !== "intercom") {
        throw new Error(
          `Old DS connectorProvider is ${oldDs.connectorProvider}, expected intercom`
        );
      }
      if (newDs.connectorProvider !== "intercom") {
        throw new Error(
          `New DS connectorProvider is ${newDs.connectorProvider}, expected intercom`
        );
      }
      if (!oldDs.connectorId || !newDs.connectorId) {
        throw new Error("Both data sources must have a connectorId");
      }
      if (oldDs.connectorId === newDs.connectorId) {
        throw new Error(
          `connectorIds must differ, got ${oldDs.connectorId} for both`
        );
      }

      logger.info(
        {
          workspaceId,
          workspaceModelId,
          oldDataSourceModelId: oldDs.id,
          newDataSourceModelId: newDs.id,
          oldConnectorId: oldDs.connectorId,
          newConnectorId: newDs.connectorId,
          oldDustAPIDataSourceId: oldDs.dustAPIDataSourceId,
          newDustAPIDataSourceId: newDs.dustAPIDataSourceId,
        },
        "Resolved data sources"
      );

      const rewrite = buildIntercomParentRewriter(
        oldDs.connectorId,
        newDs.connectorId
      );

      // Sanity check: rewrite a known sample.
      const sample = `intercom-help-center-${oldDs.connectorId}-abc`;
      const rewritten = rewrite(sample);
      logger.info({ sample, rewritten }, "Parent rewrite sanity check");
      if (rewritten === sample) {
        throw new Error("Parent rewriter failed sanity check");
      }

      // Unmanaged transaction so we can commit/rollback explicitly based on
      // the --execute flag (no throw-to-rollback dance).
      const transaction = await frontSequelize.transaction();
      try {
        const { oldToNewDsvId, stats: dsvStats } = await restoreDataSourceViews(
          {
            snapshot,
            transaction,
            logger,
            oldDs,
            newDs,
            rewrite,
            execute,
          }
        );

        logger.info(
          {
            dsvMapping: Array.from(oldToNewDsvId.entries()).map(
              ([oldId, newId]) => ({ oldDsvId: oldId, newDsvId: newId })
            ),
          },
          "DSV old→new id mapping"
        );

        const agentConfigStats = await restoreAgentDataSourceConfigurations({
          snapshot,
          transaction,
          logger,
          oldDs,
          newDs,
          oldToNewDsvId,
          rewrite,
          execute,
        });

        const tablesStats = await restoreAgentTablesQueryConfigurationTables({
          snapshot,
          transaction,
          logger,
          oldDs,
          newDs,
          oldToNewDsvId,
          execute,
        });

        const skillStats = await restoreSkillDataSourceConfigurations({
          snapshot,
          transaction,
          logger,
          oldDs,
          newDs,
          oldToNewDsvId,
          rewrite,
          execute,
        });

        logger.info(
          "Skipping content_fragment restore (single stale row, not worth the risk)."
        );

        logger.info(
          {
            execute,
            dataSourceViews: dsvStats,
            agentDataSourceConfigurations: agentConfigStats,
            agentTablesQueryConfigurationTables: tablesStats,
            skillDataSourceConfigurations: skillStats,
          },
          "=== Reconciliation summary ==="
        );

        if (execute) {
          await transaction.commit();
          logger.info("Reconciliation complete — transaction committed.");
        } else {
          await transaction.rollback();
          logger.info(
            "Dry-run complete — transaction rolled back. Re-run with --execute to commit."
          );
        }
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    } finally {
      await snapshot.close();
    }
  }
);
