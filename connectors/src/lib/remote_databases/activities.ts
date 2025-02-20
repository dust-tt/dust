import type { MIME_TYPES } from "@dust-tt/types";
import { heartbeat } from "@temporalio/activity";

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
import type { RemoteDBTree } from "@connectors/lib/remote_databases/utils";
import {
  parseSchemaInternalId,
  parseTableInternalId,
} from "@connectors/lib/remote_databases/utils";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

const isDatabaseReadGranted = ({
  readGrantedInternalIds,
  internalId,
}: {
  readGrantedInternalIds: Set<string>;
  internalId: string;
}) => {
  return readGrantedInternalIds.has(internalId);
};

const createDatabase = async ({
  dataSourceConfig,
  databaseInternalId,
  allDatabases,
  connector,
  mimeTypes,
}: {
  dataSourceConfig: DataSourceConfig;
  databaseInternalId: string;

  allDatabases: RemoteDatabaseModel[];
  connector: ConnectorResource;
  mimeTypes: typeof MIME_TYPES.BIGQUERY | typeof MIME_TYPES.SNOWFLAKE;
}): Promise<{
  newDatabase: RemoteDatabaseModel | null;
  usedInternalIds: Set<string>;
}> => {
  const usedInternalIds = new Set<string>();
  usedInternalIds.add(databaseInternalId);

  // Check if the database exists
  const existingDb = allDatabases.find(
    (d) => d.internalId === databaseInternalId
  );

  let newDatabase: RemoteDatabaseModel | null = null;

  if (!existingDb || !existingDb.lastUpsertedAt) {
    if (!existingDb) {
      // Create and add the database to the list of all databases.
      newDatabase = await RemoteDatabaseModel.create({
        connectorId: connector.id,
        internalId: databaseInternalId,
        name: databaseInternalId,
        permission: "inherited",
        lastUpsertedAt: new Date(),
      });
    } else if (!existingDb.lastUpsertedAt) {
      await existingDb.update({
        permission:
          existingDb.permission === "selected" ? "selected" : "inherited",
        lastUpsertedAt: new Date(),
      });
    }

    // ...upsert the database in core
    await upsertDataSourceFolder({
      dataSourceConfig,
      folderId: databaseInternalId,
      title: databaseInternalId,
      parents: [databaseInternalId],
      parentId: null,
      mimeType: mimeTypes.DATABASE,
    });
  }

  return { newDatabase, usedInternalIds };
};

const isSchemaReadGranted = ({
  readGrantedInternalIds,
  internalId,
}: {
  readGrantedInternalIds: Set<string>;
  internalId: string;
}) => {
  const { database_name } = parseSchemaInternalId(internalId);

  return (
    readGrantedInternalIds.has(database_name) ||
    readGrantedInternalIds.has(internalId)
  );
};

const createSchemaAndHierarchy = async ({
  dataSourceConfig,
  schemaInternalId,
  allDatabases,
  allSchemas,
  connector,
  mimeTypes,
}: {
  dataSourceConfig: DataSourceConfig;
  schemaInternalId: string;
  allDatabases: RemoteDatabaseModel[];
  allSchemas: RemoteSchemaModel[];
  connector: ConnectorResource;
  mimeTypes: typeof MIME_TYPES.BIGQUERY | typeof MIME_TYPES.SNOWFLAKE;
}): Promise<{
  newDatabase: RemoteDatabaseModel | null;
  newSchema: RemoteSchemaModel | null;
  usedInternalIds: Set<string>;
}> => {
  const usedInternalIds = new Set<string>();
  let newSchema: RemoteSchemaModel | null = null;

  const { database_name, name } = parseSchemaInternalId(schemaInternalId);

  const { newDatabase, usedInternalIds: newDatabaseUsedInternalIds } =
    await createDatabase({
      dataSourceConfig,
      databaseInternalId: database_name,
      allDatabases,
      connector,
      mimeTypes,
    });
  for (const usedInternalId of newDatabaseUsedInternalIds) {
    usedInternalIds.add(usedInternalId);
  }

  // Mark as used
  usedInternalIds.add(schemaInternalId);

  // Check if the schema exists
  const existingSchema = allSchemas.find(
    (s) => s.internalId === schemaInternalId
  );
  if (!existingSchema || !existingSchema.lastUpsertedAt) {
    if (!existingSchema) {
      // Create and add the schema to the list of all schemas.
      newSchema = await RemoteSchemaModel.create({
        connectorId: connector.id,
        internalId: schemaInternalId,
        name: name,
        databaseName: database_name,
        permission: "inherited",
        lastUpsertedAt: new Date(),
      });
    } else if (!existingSchema.lastUpsertedAt) {
      await existingSchema.update({
        permission:
          existingSchema.permission === "selected" ? "selected" : "inherited",
        lastUpsertedAt: new Date(),
      });
    }

    // ...upsert the schema in core
    await upsertDataSourceFolder({
      dataSourceConfig,
      folderId: schemaInternalId,
      title: name,
      parents: [schemaInternalId, database_name],
      parentId: database_name,
      mimeType: mimeTypes.SCHEMA,
    });
  }

  return { newDatabase, newSchema, usedInternalIds };
};

const isTableReadGranted = ({
  readGrantedInternalIds,
  internalId,
}: {
  readGrantedInternalIds: Set<string>;
  internalId: string;
}) => {
  const { database_name, schema_name } = parseTableInternalId(internalId);
  const schemaInternalId = [database_name, schema_name].join(".");

  return (
    readGrantedInternalIds.has(database_name) ||
    readGrantedInternalIds.has(schemaInternalId) ||
    readGrantedInternalIds.has(internalId)
  );
};

const createTableAndHierarchy = async ({
  tableInternalId,
  allTables,
  allSchemas,
  allDatabases,
  connector,
  mimeTypes,
}: {
  tableInternalId: string;
  allTables: RemoteTableModel[];
  allSchemas: RemoteSchemaModel[];
  allDatabases: RemoteDatabaseModel[];
  connector: ConnectorResource;
  mimeTypes: typeof MIME_TYPES.BIGQUERY | typeof MIME_TYPES.SNOWFLAKE;
}): Promise<{
  newDatabase: RemoteDatabaseModel | null;
  newSchema: RemoteSchemaModel | null;
  newTable: RemoteTableModel | null;
  usedInternalIds: Set<string>;
}> => {
  const usedInternalIds = new Set<string>();
  let newTable: RemoteTableModel | null = null;

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const {
    database_name: dbName,
    schema_name: schemaName,
    name: tableName,
  } = parseTableInternalId(tableInternalId);

  const schemaInternalId = [dbName, schemaName].join(".");

  const {
    newDatabase,
    newSchema,
    usedInternalIds: newSchemaUsedInternalIds,
  } = await createSchemaAndHierarchy({
    dataSourceConfig,
    schemaInternalId,
    allDatabases,
    allSchemas,
    connector,
    mimeTypes,
  });

  for (const usedInternalId of newSchemaUsedInternalIds) {
    usedInternalIds.add(usedInternalId);
  }
  if (newDatabase) {
    allDatabases.push(newDatabase);
  }
  if (newSchema) {
    allSchemas.push(newSchema);
  }

  usedInternalIds.add(tableInternalId);

  // Check it table already exists
  const existingTable = allTables.find((t) => t.internalId === tableInternalId);

  if (!existingTable || !existingTable.lastUpsertedAt) {
    if (!existingTable) {
      // Create and add the table to the list of all tables.
      newTable = await RemoteTableModel.create({
        connectorId: connector.id,
        internalId: tableInternalId,
        name: tableName,
        schemaName,
        databaseName: dbName,
        permission: "inherited",
        lastUpsertedAt: new Date(),
      });
    } else if (!existingTable.lastUpsertedAt) {
      await existingTable.update({
        permission:
          existingTable.permission === "selected" ? "selected" : "inherited",
        lastUpsertedAt: new Date(),
      });
    }
    // ...upsert the table in core
    await upsertDataSourceRemoteTable({
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
    });
  }

  return { newDatabase, newSchema, newTable, usedInternalIds };
};

export async function sync({
  remoteDBTree,
  connector,
  mimeTypes,
}: {
  remoteDBTree?: RemoteDBTree;
  connector: ConnectorResource;
  mimeTypes: typeof MIME_TYPES.BIGQUERY | typeof MIME_TYPES.SNOWFLAKE;
}) {
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

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

  let createdDatabases = 0;
  let createdSchemas = 0;
  let createdTables = 0;

  const localLogger = logger.child({
    connectorId: connector.id,
  });

  localLogger.info(
    {
      existingDatabasesCount: allDatabases.length,
      existingSchemasCount: allSchemas.length,
      existingTablesCount: allTables.length,
    },
    "Found existing databases, schemas and tables in connector DB"
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

  localLogger.info(
    {
      readGrantedInternalIdsCount: readGrantedInternalIds.size,
    },
    "Found read granted internal ids"
  );

  const usedInternalIds = new Set<string>();

  localLogger.info(
    {
      databasesCount: remoteDBTree?.databases.length ?? 0,
    },
    "Creating databases, schemas and tables..."
  );

  // Loop through the databases and create them if they are read granted
  for (const db of remoteDBTree?.databases ?? []) {
    if (
      isDatabaseReadGranted({
        readGrantedInternalIds,
        internalId: db.name,
      })
    ) {
      const { newDatabase, usedInternalIds: newDatabaseUsedInternalIds } =
        await createDatabase({
          dataSourceConfig,
          databaseInternalId: db.name,
          allDatabases,
          connector,
          mimeTypes,
        });
      for (const usedInternalId of newDatabaseUsedInternalIds) {
        usedInternalIds.add(usedInternalId);
      }
      if (newDatabase) {
        allDatabases.push(newDatabase);
        createdDatabases++;
      }
    }

    // Loop through the schemas and create them if they are read granted
    for (const schema of db.schemas) {
      const schemaInternalId = `${db.name}.${schema.name}`;
      if (
        isSchemaReadGranted({
          readGrantedInternalIds,
          internalId: schemaInternalId,
        })
      ) {
        const {
          newDatabase,
          newSchema,
          usedInternalIds: newSchemaUsedInternalIds,
        } = await createSchemaAndHierarchy({
          dataSourceConfig,
          schemaInternalId,
          allDatabases,
          allSchemas,
          connector,
          mimeTypes,
        });
        for (const usedInternalId of newSchemaUsedInternalIds) {
          usedInternalIds.add(usedInternalId);
        }
        if (newDatabase) {
          allDatabases.push(newDatabase);
          createdDatabases++;
        }
        if (newSchema) {
          allSchemas.push(newSchema);
          createdSchemas++;
        }
      }

      let i = 0;
      // Loop through the tables and create them if they are read granted
      for (const table of schema.tables) {
        const tableInternalId = `${table.database_name}.${table.schema_name}.${table.name}`;
        if (
          isTableReadGranted({
            readGrantedInternalIds,
            internalId: tableInternalId,
          })
        ) {
          const {
            newDatabase,
            newSchema,
            newTable,
            usedInternalIds: newTableUsedInternalIds,
          } = await createTableAndHierarchy({
            tableInternalId,
            allTables,
            allSchemas,
            allDatabases,
            connector,
            mimeTypes,
          });
          for (const usedInternalId of newTableUsedInternalIds) {
            usedInternalIds.add(usedInternalId);
          }
          if (newDatabase) {
            allDatabases.push(newDatabase);
            createdDatabases++;
          }
          if (newSchema) {
            allSchemas.push(newSchema);
            createdSchemas++;
          }
          if (newTable) {
            allTables.push(newTable);
            createdTables++;
          }
        }

        i++;
        if (i % 25 === 0) {
          await heartbeat();
        }
      }
    }
  }

  localLogger.info(
    {
      createdDatabases,
      createdSchemas,
      createdTables,
    },
    "Created databases, schemas and tables"
  );

  localLogger.info(
    {
      databasesToKeep: allDatabases.filter((db) =>
        usedInternalIds.has(db.internalId)
      ).length,
      schemasToKeep: allSchemas.filter((s) => usedInternalIds.has(s.internalId))
        .length,
      tablesToKeep: allTables.filter((t) => usedInternalIds.has(t.internalId))
        .length,
      databasesToRemove: allDatabases.filter(
        (db) => !usedInternalIds.has(db.internalId)
      ).length,
      schemasToRemove: allSchemas.filter(
        (s) => !usedInternalIds.has(s.internalId)
      ).length,
      tablesToRemove: allTables.filter(
        (t) => !usedInternalIds.has(t.internalId)
      ).length,
    },
    "Removing unused databases, schemas and tables"
  );

  for (const unusedDb of allDatabases.filter(
    (db) => !usedInternalIds.has(db.internalId)
  )) {
    await deleteDataSourceFolder({
      dataSourceConfig,
      folderId: unusedDb.internalId,
    });
    await unusedDb.destroy();

    if (unusedDb.permission === "selected") {
      localLogger.error(
        {
          databaseInternalId: unusedDb.internalId,
        },
        "Database is selected but not used, it should never happen and surface a flaw in the logic above."
      );
    }
  }

  for (const unusedSchema of allSchemas.filter(
    (schema) => !usedInternalIds.has(schema.internalId)
  )) {
    await deleteDataSourceFolder({
      dataSourceConfig,
      folderId: unusedSchema.internalId,
    });
    await unusedSchema.destroy();

    if (unusedSchema.permission === "selected") {
      localLogger.error(
        {
          schemaInternalId: unusedSchema.internalId,
        },
        "Schema is selected but not used, it should never happen and surface a flaw in the logic above."
      );
    }
  }

  for (const unusedTable of allTables.filter(
    (table) => !usedInternalIds.has(table.internalId)
  )) {
    await deleteDataSourceTable({
      dataSourceConfig,
      tableId: unusedTable.internalId,
    });
    await unusedTable.destroy();

    if (unusedTable.permission === "selected") {
      localLogger.error(
        {
          tableInternalId: unusedTable.internalId,
        },
        "Table is selected but not used, it should never happen and surface a flaw in the logic above."
      );
    }
  }

  logger.info({ connectorId: connector.id }, "Sync completed");
}
