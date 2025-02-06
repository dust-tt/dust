import type { MIME_TYPES } from "@dust-tt/types";

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
import type { ConnectorResource } from "@connectors/resources/connector_resource";

export async function sync({
  liveTables,
  connector,
  mimeTypes,
}: {
  liveTables: RemoteDBTable[];
  connector: ConnectorResource;
  mimeTypes: typeof MIME_TYPES.BIGQUERY | typeof MIME_TYPES.SNOWFLAKE;
}) {
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const liveTablesInternalIds = new Set(
    liveTables.map((t) => `${t.database_name}.${t.schema_name}.${t.name}`)
  );

  const [allDatabases, allSchemas, allTables] = await Promise.all([
    RemoteDatabaseModel.findAll({
      where: {
        connectorId: connector.id,
      },
    }),
    RemoteSchemaModel.findAll({
      where: {
        connectorId: connector.id,
      },
    }),
    RemoteTableModel.findAll({
      where: {
        connectorId: connector.id,
      },
    }),
  ]);

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

  const dbLeadingToAReadableTableInternalIds = new Set<string>();
  const schemaLeadingToAReadableTableInternalIds = new Set<string>();
  const readableTableInternalIds = new Set<string>();

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

  const createTableAndHierarchy = async (tableInternalId: string) => {
    const [dbName, schemaName, tableName] =
      parseTableInternalId(tableInternalId);
    const schemaInternalId = [dbName, schemaName].join(".");

    // Mark everything as leading to a readable table
    dbLeadingToAReadableTableInternalIds.add(dbName);
    schemaLeadingToAReadableTableInternalIds.add(schemaInternalId);
    readableTableInternalIds.add(tableInternalId);

    // Check it table already exists
    const existingTable = allTables.find(
      (t) => t.internalId === tableInternalId
    );
    if (!existingTable) {
      // Create and add the table to the list of all tables.
      allTables.push(
        await RemoteTableModel.create({
          connectorId: connector.id,
          internalId: tableInternalId,
          name: tableName,
          schemaName,
          databaseName: dbName,
          permission: "inherited",
          lastUpsertedAt: new Date(),
        })
      );
    } else {
      await existingTable.update({
        lastUpsertedAt: new Date(),
      });
    }

    // Check if the schema exists
    const existingSchema = allSchemas.find(
      (s) => s.internalId === schemaInternalId
    );
    if (!existingSchema) {
      // Create and add the schema to the list of all schemas.
      allSchemas.push(
        await RemoteSchemaModel.create({
          connectorId: connector.id,
          internalId: schemaInternalId,
          name: schemaName,
          databaseName: dbName,
          permission: "inherited",
        })
      );
    }

    // Check if the database exists
    const existingDb = allDatabases.find((d) => d.internalId === dbName);
    if (!existingDb) {
      // Create and add the database to the list of all databases.
      allDatabases.push(
        await RemoteDatabaseModel.create({
          connectorId: connector.id,
          internalId: dbName,
          name: dbName,
          permission: "inherited",
        })
      );
    }

    await Promise.all([
      // ...upsert the table in core
      upsertDataSourceRemoteTable({
        dataSourceConfig,
        tableId: tableInternalId,
        tableName: tableInternalId,
        remoteDatabaseTableId: tableInternalId,
        remoteDatabaseSecretId: connector.connectionId,
        tableDescription: "",
        parents: [tableInternalId, schemaInternalId, dbName],
        parentId: schemaInternalId,
        title: tableName,
        mimeType: mimeTypes.TABLE,
      }),

      // ...upsert the schema in core
      upsertDataSourceFolder({
        dataSourceConfig,
        folderId: schemaInternalId,
        title: schemaName,
        parents: [schemaInternalId, dbName],
        parentId: dbName,
        mimeType: mimeTypes.SCHEMA,
      }),

      // ...upsert the database in core
      upsertDataSourceFolder({
        dataSourceConfig,
        folderId: dbName,
        title: dbName,
        parents: [dbName],
        parentId: null,
        mimeType: mimeTypes.DATABASE,
      }),
    ]);
  };

  for (const internalId of liveTablesInternalIds) {
    if (isTableReadGranted(internalId)) {
      await createTableAndHierarchy(internalId);
    }
  }

  // Removing the unused databases, schemas and tables to keep only a tree that lead to tables
  for (const db of allDatabases) {
    if (!dbLeadingToAReadableTableInternalIds.has(db.internalId)) {
      // Remove in core so that we don't show a tree leading to nowhere in the UI.
      await deleteDataSourceFolder({
        dataSourceConfig,
        folderId: db.internalId,
      });
      // Keep "selected" databases so we can rediscover tables under them in future syncs, even if none was found this time.
      if (db.permission !== "selected") {
        await db.destroy();
      }
    }
  }

  for (const schema of allSchemas) {
    if (!schemaLeadingToAReadableTableInternalIds.has(schema.internalId)) {
      // Remove in core so that we don't show a tree leading to nowhere in the UI.
      await deleteDataSourceFolder({
        dataSourceConfig,
        folderId: schema.internalId,
      });
      // Keep "selected" schemas so we can rediscover tables under them in future syncs, even if none was found this time.
      if (schema.permission !== "selected") {
        await schema.destroy();
      }
    }
  }

  for (const table of allTables) {
    if (!readableTableInternalIds.has(table.internalId)) {
      // Remove in core so that we don't show a tree leading to nowhere in the UI.
      await deleteDataSourceTable({
        dataSourceConfig,
        tableId: table.internalId,
      });
      // Keep "selected" tables so we can rediscover them in future syncs, even if none was found this time.
      if (table.permission !== "selected") {
        await table.destroy();
      }
    }
  }
}
