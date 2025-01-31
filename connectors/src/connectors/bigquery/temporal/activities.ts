import type { ModelId } from "@dust-tt/types";
import { isBigQueryWithLocationCredentials, MIME_TYPES } from "@dust-tt/types";

import {
  connectToBigQuery,
  fetchDatasets,
  fetchTables,
  isConnectionReadonly,
} from "@connectors/connectors/bigquery/lib/bigquery_api";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  deleteDataSourceFolder,
  deleteDataSourceTable,
  upsertDataSourceFolder,
  upsertDataSourceRemoteTable,
} from "@connectors/lib/data_sources";
import {
  RemoteDatabaseModel,
  RemoteSchemaModel,
  RemoteTableModel,
} from "@connectors/lib/models/remote_databases";
import type { RemoteDBTable } from "@connectors/lib/remote_databases/utils";
import {
  getConnectorAndCredentials,
  parseSchemaInternalId,
} from "@connectors/lib/remote_databases/utils";
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import logger from "@connectors/logger/logger";

export async function syncBigQueryConnection(connectorId: ModelId) {
  const getConnectorAndCredentialsRes = await getConnectorAndCredentials({
    connectorId,
    isTypeGuard: isBigQueryWithLocationCredentials,
    logger,
  });
  if (getConnectorAndCredentialsRes.isErr()) {
    throw getConnectorAndCredentialsRes.error;
  }

  await syncStarted(connectorId);

  const { credentials, connector } = getConnectorAndCredentialsRes.value;

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const connection = connectToBigQuery(credentials);

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

  // removing the unselected databases (from core and connectors)
  const unselectedDatabases = allDatabases.filter(
    (db) => db.permission === "unselected"
  );
  for (const db of unselectedDatabases) {
    await deleteDataSourceFolder({ dataSourceConfig, folderId: db.internalId });
    await db.destroy();
    for (const schema of allSchemas.filter(
      (schema) =>
        schema.databaseName === db.name && schema.permission === "inherited"
    )) {
      await deleteDataSourceFolder({
        dataSourceConfig,
        folderId: schema.internalId,
      });
      await schema.destroy();
    }
  }

  // removing the unselected schemas (from core and connectors)
  const unselectedSchema = allSchemas.filter(
    (schema) => schema.permission === "unselected"
  );
  for (const schema of unselectedSchema) {
    await deleteDataSourceFolder({
      dataSourceConfig,
      folderId: schema.internalId,
    });
    await schema.destroy();
  }

  // BigQuery is read-only as we force the readonly scope when creating the client.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- BigQuery is read-only but leaving the call in case of copy-pasting later.
  const readonlyConnectionCheck = isConnectionReadonly();
  const datasetRes = await fetchDatasets({ credentials, connection });
  if (datasetRes.isErr()) {
    throw datasetRes.error;
  }
  const datasets = datasetRes.value;

  const tables: RemoteDBTable[] = [];
  for (const dataset of datasets) {
    const tablesOnBigQueryRes = await fetchTables({
      credentials,
      datasetName: dataset.name,
      connection,
    });
    if (tablesOnBigQueryRes.isErr()) {
      throw tablesOnBigQueryRes.error;
    }

    tables.push(...tablesOnBigQueryRes.value);
  }

  const internalTableIds = new Set(
    tables.map((t) => `${t.database_name}.${t.schema_name}.${t.name}`)
  );

  const readGrantedInternalIds = new Set([
    ...allDatabases
      .filter((db) => db.permission === "selected")
      .map((db) => db.internalId),
    ...allSchemas
      .filter((s) => s.permission === "selected")
      .map((s) => s.internalId),
    ...allTables
      .filter((t) => t.permission === "selected")
      .map((t) => t.internalId),
  ]);
  const tableByInternalId = Object.fromEntries(
    allTables.map((table) => [table.internalId, table])
  );

  // upserting data_sources_folders for the databases
  for (const db of allDatabases) {
    if (readGrantedInternalIds.has(db.internalId)) {
      await upsertDataSourceFolder({
        dataSourceConfig,
        folderId: db.internalId,
        title: db.name,
        parents: [db.internalId],
        parentId: null,
        mimeType: MIME_TYPES.BIGQUERY.DATABASE,
      });
    }
  }

  // upserting data_sources_folders for the schemas
  for (const schema of allSchemas) {
    const { database_name: dbName, name: schemaName } = parseSchemaInternalId(
      schema.internalId
    );

    let parents = [schema.internalId];
    let schemaShouldBeSynced = false;

    if (readGrantedInternalIds.has(dbName)) {
      schemaShouldBeSynced = true;
      parents = [schema.internalId, dbName];
    } else if (readGrantedInternalIds.has(schema.internalId)) {
      schemaShouldBeSynced = true;
      parents = [schema.internalId];
    }

    if (schemaShouldBeSynced) {
      // if the parent database is selected, it should be added as a parent, otherwise the schema is a root
      await upsertDataSourceFolder({
        dataSourceConfig,
        folderId: schema.internalId,
        title: schemaName,
        parents: parents,
        parentId: parents[1] || null,
        mimeType: MIME_TYPES.BIGQUERY.SCHEMA,
      });
    }
  }

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

  for (const internalId of internalTableIds) {
    const [dbName, schemaName, tableName] = parseTableInternalId(internalId);
    const schemaInternalId = [dbName, schemaName].join(".");

    let tableShouldBeSynced = false;
    let parents = [internalId];

    if (readGrantedInternalIds.has(dbName)) {
      tableShouldBeSynced = true;
      parents = [internalId, schemaInternalId, dbName];
    } else if (readGrantedInternalIds.has(schemaInternalId)) {
      tableShouldBeSynced = true;
      parents = [internalId, schemaInternalId];
    } else if (readGrantedInternalIds.has(internalId)) {
      tableShouldBeSynced = true;
      parents = [internalId];
    }

    if (tableShouldBeSynced) {
      let table = tableByInternalId[internalId];
      if (!table || !table.lastUpsertedAt) {
        if (!table) {
          table = await RemoteTableModel.create({
            connectorId,
            internalId,
            permission: "inherited",
            name: tableName,
            schemaName,
            databaseName: dbName,
          });
        }

        await upsertDataSourceRemoteTable({
          dataSourceConfig,
          tableId: internalId,
          tableName: internalId,
          remoteDatabaseTableId: internalId,
          remoteDatabaseSecretId: connector.connectionId,
          tableDescription: "",
          parents,
          parentId: parents[1] || null,
          title: table.name,
          mimeType: MIME_TYPES.BIGQUERY.TABLE,
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
      !internalTableIds.has(t.internalId)
    ) {
      if (t.lastUpsertedAt) {
        await deleteDataSourceTable({
          dataSourceConfig: dataSourceConfigFromConnector(connector),
          tableId: t.internalId,
        });
      }
      await t.destroy();
    }
  }

  await syncSucceeded(connectorId);
}
