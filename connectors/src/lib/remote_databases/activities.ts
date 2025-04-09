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
import { SalesforceConfigurationModel } from "@connectors/lib/models/salesforce";
import type {
  RemoteDBSchema,
  RemoteDBTable,
  RemoteDBTree,
} from "@connectors/lib/remote_databases/utils";
import { buildInternalId } from "@connectors/lib/remote_databases/utils";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { INTERNAL_MIME_TYPES } from "@connectors/types";
import type { DataSourceConfig } from "@connectors/types";

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
  databaseName,
  allDatabases,
  connector,
  mimeTypes,
}: {
  dataSourceConfig: DataSourceConfig;
  databaseName: string;

  allDatabases: RemoteDatabaseModel[];
  connector: ConnectorResource;
  mimeTypes:
    | typeof INTERNAL_MIME_TYPES.BIGQUERY
    | typeof INTERNAL_MIME_TYPES.SNOWFLAKE
    | typeof INTERNAL_MIME_TYPES.SALESFORCE;
}): Promise<{
  newDatabase: RemoteDatabaseModel | null;
  usedInternalIds: Set<string>;
}> => {
  const databaseInternalId = buildInternalId({
    databaseName,
  });
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
        name: databaseName,
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
      title: databaseName,
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
  schema,
}: {
  readGrantedInternalIds: Set<string>;
  internalId: string;
  schema: RemoteDBSchema;
}) => {
  const { database_name } = schema;
  const databaseInternalId = buildInternalId({
    databaseName: database_name,
  });

  return (
    readGrantedInternalIds.has(databaseInternalId) ||
    readGrantedInternalIds.has(internalId)
  );
};

const createSchemaAndHierarchy = async ({
  dataSourceConfig,
  schema,
  allDatabases,
  allSchemas,
  connector,
  mimeTypes,
}: {
  dataSourceConfig: DataSourceConfig;
  schema: RemoteDBSchema;
  allDatabases: RemoteDatabaseModel[];
  allSchemas: RemoteSchemaModel[];
  connector: ConnectorResource;
  mimeTypes:
    | typeof INTERNAL_MIME_TYPES.BIGQUERY
    | typeof INTERNAL_MIME_TYPES.SNOWFLAKE
    | typeof INTERNAL_MIME_TYPES.SALESFORCE;
}): Promise<{
  newDatabase: RemoteDatabaseModel | null;
  newSchema: RemoteSchemaModel | null;
  usedInternalIds: Set<string>;
}> => {
  const usedInternalIds = new Set<string>();
  let newSchema: RemoteSchemaModel | null = null;

  const { database_name, name } = schema;

  const schemaInternalId = buildInternalId({
    databaseName: database_name,
    schemaName: name,
  });

  const { newDatabase, usedInternalIds: newDatabaseUsedInternalIds } =
    await createDatabase({
      dataSourceConfig,
      databaseName: database_name,
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

    const databaseInternalId = buildInternalId({
      databaseName: database_name,
    });

    // ...upsert the schema in core
    await upsertDataSourceFolder({
      dataSourceConfig,
      folderId: schemaInternalId,
      title: name,
      parents: [schemaInternalId, databaseInternalId],
      parentId: databaseInternalId,
      mimeType: mimeTypes.SCHEMA,
    });
  }

  return { newDatabase, newSchema, usedInternalIds };
};

const isTableReadGranted = ({
  readGrantedInternalIds,
  tableInternalId,
  table,
}: {
  readGrantedInternalIds: Set<string>;
  tableInternalId: string;
  table: RemoteDBTable;
}) => {
  const { database_name, schema_name } = table;
  const databaseInternalId = buildInternalId({
    databaseName: database_name,
  });
  const schemaInternalId = buildInternalId({
    databaseName: database_name,
    schemaName: schema_name,
  });

  return (
    readGrantedInternalIds.has(databaseInternalId) ||
    readGrantedInternalIds.has(schemaInternalId) ||
    readGrantedInternalIds.has(tableInternalId)
  );
};

const createTableAndHierarchy = async ({
  tableInternalId,
  table,
  allTables,
  allSchemas,
  allDatabases,
  connector,
  usePersonalConnections,
  forceSync,
  mimeTypes,
  internalTableIdToRemoteTableId,
}: {
  tableInternalId: string;
  table: RemoteDBTable;
  allTables: RemoteTableModel[];
  allSchemas: RemoteSchemaModel[];
  allDatabases: RemoteDatabaseModel[];
  connector: ConnectorResource;
  usePersonalConnections?: boolean;
  forceSync?: boolean;
  mimeTypes:
    | typeof INTERNAL_MIME_TYPES.BIGQUERY
    | typeof INTERNAL_MIME_TYPES.SNOWFLAKE
    | typeof INTERNAL_MIME_TYPES.SALESFORCE;
  internalTableIdToRemoteTableId: (internalTableId: string) => string;
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
  } = table;

  const schema = { name: schemaName, database_name: dbName };
  const schemaInternalId = buildInternalId({
    databaseName: dbName,
    schemaName,
  });
  const {
    newDatabase,
    newSchema,
    usedInternalIds: newSchemaUsedInternalIds,
  } = await createSchemaAndHierarchy({
    dataSourceConfig,
    schema,
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

  if (!existingTable || !existingTable.lastUpsertedAt || forceSync) {
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
    const databaseInternalId = buildInternalId({
      databaseName: dbName,
    });
    await upsertDataSourceRemoteTable({
      dataSourceConfig,
      tableId: tableInternalId,
      tableName: table.name,
      remoteDatabaseTableId: internalTableIdToRemoteTableId(tableInternalId),
      remoteDatabaseSecretId: usePersonalConnections
        ? null
        : connector.connectionId,
      tableDescription: "",
      parents: [tableInternalId, schemaInternalId, databaseInternalId],
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
  internalTableIdToRemoteTableId = (internalTableId: string) => internalTableId,
  forceSync = false,
  usePersonalConnections = false,
}: {
  remoteDBTree?: RemoteDBTree;
  connector: ConnectorResource;
  mimeTypes:
    | typeof INTERNAL_MIME_TYPES.BIGQUERY
    | typeof INTERNAL_MIME_TYPES.SNOWFLAKE
    | typeof INTERNAL_MIME_TYPES.SALESFORCE;
  internalTableIdToRemoteTableId?: (internalTableId: string) => string;
  forceSync?: boolean;
  usePersonalConnections?: boolean;
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
        internalId: buildInternalId({
          databaseName: db.name,
        }),
      })
    ) {
      const { newDatabase, usedInternalIds: newDatabaseUsedInternalIds } =
        await createDatabase({
          dataSourceConfig,
          databaseName: db.name,
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
      const schemaInternalId = buildInternalId({
        databaseName: db.name,
        schemaName: schema.name,
      });
      if (
        isSchemaReadGranted({
          readGrantedInternalIds,
          internalId: schemaInternalId,
          schema,
        })
      ) {
        const {
          newDatabase,
          newSchema,
          usedInternalIds: newSchemaUsedInternalIds,
        } = await createSchemaAndHierarchy({
          dataSourceConfig,
          schema,
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
        const tableInternalId = buildInternalId({
          databaseName: table.database_name,
          schemaName: table.schema_name,
          tableName: table.name,
        });
        if (
          isTableReadGranted({
            readGrantedInternalIds,
            tableInternalId,
            table,
          })
        ) {
          const {
            newDatabase,
            newSchema,
            newTable,
            usedInternalIds: newTableUsedInternalIds,
          } = await createTableAndHierarchy({
            tableInternalId,
            table,
            allTables,
            allSchemas,
            allDatabases,
            connector,
            mimeTypes,
            internalTableIdToRemoteTableId,
            usePersonalConnections,
            forceSync,
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
          heartbeat();
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
