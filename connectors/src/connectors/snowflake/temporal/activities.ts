import type { ModelId } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

import { fetchTables } from "@connectors/connectors/snowflake/lib/snowflake_api";
import { getConnectorAndCredentials } from "@connectors/connectors/snowflake/lib/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { deleteTable, upsertTable } from "@connectors/lib/data_sources";
import {
  RemoteDatabaseModel,
  RemoteSchemaModel,
  RemoteTableModel,
} from "@connectors/lib/models/remote_databases";
import { syncSucceeded } from "@connectors/lib/sync_status";
import logger from "@connectors/logger/logger";

const snowflakeTableCodec = t.type({
  name: t.string,
  database_name: t.string,
  schema_name: t.string,
});

export async function syncSnowflakeConnection(connectorId: ModelId) {
  const getConnectorAndCredentialsRes = await getConnectorAndCredentials({
    connectorId,
    logger,
  });
  if (getConnectorAndCredentialsRes.isErr()) {
    throw getConnectorAndCredentialsRes.error;
  }

  const { credentials, connector } = getConnectorAndCredentialsRes.value;

  const tablesRes = await fetchTables({ credentials });
  if (tablesRes.isErr()) {
    throw tablesRes.error;
  }
  const tablesValidation = t.array(snowflakeTableCodec).decode(tablesRes.value);
  if (isLeft(tablesValidation)) {
    const pathError = reporter.formatValidationErrors(tablesValidation.left);
    throw new Error(`Invalid tables response: ${pathError}`);
  }
  const tablesOnSnowflake = tablesValidation.right;
  const internalIdsOnSnowflake = new Set(
    tablesOnSnowflake.map(
      (t) => `${t.database_name}.${t.schema_name}.${t.name}`
    )
  );

  const [allDatabases, allSchemas, allTables] = await Promise.all([
    RemoteDatabaseModel.findAll({
      where: {
        connectorId,
      },
    }),
    RemoteSchemaModel.findAll({
      where: {
        connectorId,
      },
    }),
    RemoteTableModel.findAll({
      where: {
        connectorId,
      },
    }),
  ]);

  const readGrantedInternalIds = new Set([
    ...allDatabases.map((db) => db.internalId),
    ...allSchemas.map((s) => s.internalId),
    ...allTables
      .filter((t) => t.permission === "selected")
      .map((t) => t.internalId),
  ]);
  const tableByInternalId = Object.fromEntries(
    allTables.map((table) => [table.internalId, table])
  );

  const parseTableInternalId = (
    tableInternalId: string
  ): [string, string, string] => {
    const [dbName, schemaName, tableName] = tableInternalId.split(".");
    if (!dbName || !schemaName || !tableName) {
      throw new Error(`Invalid table internalId: ${tableInternalId}`);
    }

    return [dbName, schemaName, tableName];
  };

  const isTableReadGranted = (tableInternalId: string) => {
    const [dbName, schemaName] = parseTableInternalId(tableInternalId);

    const schemaInternalId = [dbName, schemaName].join(".");

    return (
      readGrantedInternalIds.has(dbName) ||
      readGrantedInternalIds.has(schemaInternalId) ||
      readGrantedInternalIds.has(tableInternalId)
    );
  };

  for (const internalId of internalIdsOnSnowflake) {
    if (isTableReadGranted(internalId)) {
      let table = tableByInternalId[internalId];
      if (!table || !table.lastUpsertedAt) {
        if (!table) {
          const [dbName, schemaName, tableName] =
            parseTableInternalId(internalId);
          table = await RemoteTableModel.create({
            connectorId,
            internalId,
            permission: "inherited",
            name: tableName,
            schemaName,
            databaseName: dbName,
          });
        }

        await upsertTable({
          dataSourceConfig: dataSourceConfigFromConnector(connector),
          tableId: internalId,
          tableName: internalId,
          remoteDatabaseTableId: internalId,
          remoteDatabaseSecretId: connector.connectionId,
          // TODO(SNOWFLAKE): decide what to do wrt description.
          tableDescription: "",
          parents: [
            table.internalId,
            `${table.databaseName}.${table.schemaName}`,
            table.databaseName,
          ],
        });
        await table.update({
          lastUpsertedAt: new Date(),
        });
      }
    }
  }

  for (const t of Object.values(tableByInternalId)) {
    if (
      !isTableReadGranted(t.internalId) ||
      !internalIdsOnSnowflake.has(t.internalId)
    ) {
      if (t.lastUpsertedAt) {
        await deleteTable({
          dataSourceConfig: dataSourceConfigFromConnector(connector),
          tableId: t.internalId,
        });
      }
      await t.destroy();
    }
  }

  await syncSucceeded(connectorId);
}
