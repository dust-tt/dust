import { QueryTypes } from "sequelize";

import { getConnectorsPrimaryDbConnection } from "@app/lib/production_checks/utils";
import logger from "@app/logger/logger";
import type {
  ReadTableChunkParams,
  RelocationBlob,
} from "@app/temporal/relocation/activities/types";
import { writeToRelocationStorage } from "@app/temporal/relocation/lib/file_storage/relocation";
import { generateParameterizedInsertStatements } from "@app/temporal/relocation/lib/sql/insert";
import { getTopologicalOrder } from "@app/temporal/relocation/lib/sql/schema/dependencies";
import type { ModelId } from "@app/types";

export async function getAllConnectorsForWorkspace({
  workspaceId,
}: {
  workspaceId: string;
}) {
  // TODO: Use the front databases to get the connectorIds.
  const connectorsDb = getConnectorsPrimaryDbConnection();

  const localLogger = logger.child({
    workspaceId,
  });

  localLogger.info("[SQL] Getting all connectors for workspace");

  const rows = await connectorsDb.query<{ id: ModelId }>(
    `SELECT * FROM "connectors" WHERE "workspaceId" = :workspaceId`,
    {
      replacements: { workspaceId },
      type: QueryTypes.SELECT,
      raw: true,
    }
  );

  const blob: RelocationBlob = {
    statements: {
      connectors: generateParameterizedInsertStatements("connectors", rows, {
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
  const connectorsDb = getConnectorsPrimaryDbConnection();

  return getTopologicalOrder(connectorsDb, {
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
  const connectorsDb = getConnectorsPrimaryDbConnection();

  const idClause = lastId ? `AND id > ${lastId}` : "";

  const rows = await connectorsDb.query<{ id: ModelId }>(
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
      [tableName]: generateParameterizedInsertStatements(tableName, rows, {
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
