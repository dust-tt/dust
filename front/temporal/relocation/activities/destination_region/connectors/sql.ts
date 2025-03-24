import { QueryTypes } from "sequelize";

import { getConnectorsPrimaryDbConnection } from "@app/lib/production_checks/utils";
import logger from "@app/logger/logger";
import type { RelocationBlob } from "@app/temporal/relocation/activities/types";
import { deleteFromRelocationStorage } from "@app/temporal/relocation/lib/file_storage/relocation";
import { readFromRelocationStorage } from "@app/temporal/relocation/lib/file_storage/relocation";
import type { ModelId } from "@app/types";

export async function processConnectorsTableChunk({
  connectorId,
  dataPath,
  destRegion,
  sourceRegion,
  tableName,
  workspaceId,
}: {
  connectorId?: ModelId;
  dataPath: string;
  destRegion: string;
  sourceRegion: string;
  tableName: string;
  workspaceId: string;
}) {
  const localLogger = logger.child({
    connectorId,
    destRegion,
    sourceRegion,
    tableName,
    workspaceId,
  });

  localLogger.info("[SQL] Writing table chunk.");

  const blob = await readFromRelocationStorage<RelocationBlob>(dataPath);

  for (const [tableName, statements] of Object.entries(blob.statements)) {
    logger.info(
      { tableName, dataPath, statementCount: statements.length },
      "Executing SQL statements"
    );

    const connectorsDb = getConnectorsPrimaryDbConnection();
    for (const { sql, params } of statements) {
      await connectorsDb.transaction(async (transaction) =>
        connectorsDb.query(sql, {
          bind: params,
          type: QueryTypes.INSERT,
          transaction,
        })
      );
    }
  }

  localLogger.info("[SQL] Table chunk written successfully.");

  await deleteFromRelocationStorage(dataPath);
}
