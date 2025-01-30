import type { ModelId } from "@dust-tt/types";
import { QueryTypes } from "sequelize";

import { getConnectorsReplicaDbConnection } from "@app/lib/production_checks/utils";
import logger from "@app/logger/logger";
import type {
  ReadTableChunkParams,
  RelocationBlob,
} from "@app/temporal/relocation/activities/types";
import { writeToRelocationStorage } from "@app/temporal/relocation/lib/file_storage/relocation";
import { generateInsertStatements } from "@app/temporal/relocation/lib/sql/insert";
import { getTopologicalOrder } from "@app/temporal/relocation/lib/sql/schema/dependencies";

export async function getAllConnectorsForWorkspace({
  workspaceId,
}: {
  workspaceId: string;
}) {
  // TODO: Use the front databases to get the connectorIds.

  // We can use the replica db because we don't need to write to it.
  const connectorReplicaDb = getConnectorsReplicaDbConnection();

  const localLogger = logger.child({
    workspaceId,
  });

  localLogger.info("[SQL] Getting all connectors for workspace");

  const rows = await connectorReplicaDb.query<{ id: ModelId }>(
    `SELECT * FROM "connectors" WHERE "workspaceId" = :workspaceId`,
    {
      replacements: { workspaceId },
      type: QueryTypes.SELECT,
      raw: true,
    }
  );

  const blob: RelocationBlob = {
    statements: {
      connectors: generateInsertStatements("connectors", rows, {
        onConflict: "ignore",
      }),
    },
  };

  const dataPath = await writeToRelocationStorage(blob, {
    workspaceId,
    type: "connectors",
    operation: `read_table_chunk_connectors`,
  });

  localLogger.info(
    {
      connectorCount: rows.length,
    },
    "[SQL] All connectors for workspace retrieved successfully"
  );

  return {
    connectors: rows,
    dataPath,
  };
}

export async function getTablesWithConnectorIdOrder() {
  // We can use the replica db because we don't need to write to it.
  const connectorReplicaDb = getConnectorsReplicaDbConnection();

  return getTopologicalOrder(connectorReplicaDb, {
    columnName: "connectorId",
  });
}

export async function readConnectorsTableChunk({
  connectorId,
  destRegion,
  lastId,
  limit,
  sourceRegion,
  tableName,
  workspaceId,
}: ReadTableChunkParams & { connectorId: ModelId }) {
  const localLogger = logger.child({
    connectorId,
    destRegion,
    lastId,
    sourceRegion,
    tableName,
    workspaceId,
  });

  localLogger.info("[SQL Table] Reading table chunk");

  // We can use the replica db because we don't need to write to it.
  const connectorReplicaDb = getConnectorsReplicaDbConnection();

  const idClause = lastId ? `AND id > ${lastId}` : "";

  const rows = await connectorReplicaDb.query<{ id: ModelId }>(
    `SELECT * FROM "${tableName}"
       WHERE "connectorId" = :connectorId ${idClause}
       ORDER BY id
       LIMIT :limit`,
    {
      replacements: { connectorId, limit },
      type: QueryTypes.SELECT,
      raw: true,
    }
  );

  if (rows.length === 0) {
    return {
      dataPath: null,
      hasMore: false,
      lastId,
    };
  }

  const blob: RelocationBlob = {
    statements: {
      [tableName]: generateInsertStatements(tableName, rows, {
        onConflict: "ignore",
      }),
    },
  };

  const dataPath = await writeToRelocationStorage(blob, {
    workspaceId,
    type: "connectors",
    operation: `read_table_chunk_${tableName}`,
  });

  localLogger.info(
    {
      dataPath,
    },
    "[SQL Table] Table chunk read successfully"
  );

  return {
    dataPath,
    hasMore: rows.length === limit,
    lastId: rows[rows.length - 1]?.id ?? lastId,
  };
}
