import type {
  ContentNode,
  ModelId,
  Result,
  SnowflakeCredentials,
} from "@dust-tt/types";
import { Err, EXCLUDE_DATABASES, EXCLUDE_SCHEMAS, Ok } from "@dust-tt/types";

import {
  fetchDatabases,
  fetchSchemas,
  fetchTables,
} from "@connectors/connectors/snowflake/lib/snowflake_api";
import {
  RemoteDatabaseModel,
  RemoteSchemaModel,
  RemoteTableModel,
} from "@connectors/lib/models/remote_databases";
import {
  getContentNodeFromInternalId,
  getContentNodeTypeFromInternalId,
} from "@connectors/lib/remote_databases/content_nodes";
import type { Logger } from "@connectors/logger/logger";

/**
 * Retrieves the existing content nodes for a parent in the Snowflake account.
 * If parentInternalId is null, we are at the root level and we fetch databases.
 * If parentInternalId is a database, we fetch schemas.
 * If parentInternalId is a schema, we fetch tables.
 */
export const fetchAvailableChildrenInSnowflake = async ({
  connectorId,
  credentials,
  parentInternalId,
}: {
  connectorId: ModelId;
  credentials: SnowflakeCredentials;
  parentInternalId: string | null;
}): Promise<Result<ContentNode[], Error>> => {
  if (parentInternalId === null) {
    const syncedDatabases = await RemoteDatabaseModel.findAll({
      where: { connectorId, permission: "selected" },
    });
    const syncedDatabasesInternalIds = syncedDatabases.map(
      (db) => db.internalId
    );

    const allDatabasesRes = await fetchDatabases({ credentials });
    if (allDatabasesRes.isErr()) {
      return new Err(allDatabasesRes.error);
    }
    const allDatabases = allDatabasesRes.value.filter(
      (row) => !EXCLUDE_DATABASES.includes(row.name)
    );

    return new Ok(
      allDatabases.map((row) => {
        const internalId = `${row.name}`;
        const permission = syncedDatabasesInternalIds.includes(internalId)
          ? "read"
          : "none";
        return getContentNodeFromInternalId(internalId, permission);
      })
    );
  }

  const parentType = getContentNodeTypeFromInternalId(parentInternalId);

  if (parentType === "database") {
    const syncedSchemas = await RemoteSchemaModel.findAll({
      where: { connectorId, permission: "selected" },
    });
    const syncedSchemasInternalIds = syncedSchemas.map((db) => db.internalId);

    const allSchemasRes = await fetchSchemas({
      credentials,
      fromDatabase: parentInternalId,
    });
    if (allSchemasRes.isErr()) {
      return new Err(allSchemasRes.error);
    }

    const allSchemas = allSchemasRes.value.filter(
      (row) => !EXCLUDE_SCHEMAS.includes(row.name)
    );

    return new Ok(
      allSchemas.map((row) => {
        const internalId = `${parentInternalId}.${row.name}`;
        const permission = syncedSchemasInternalIds.includes(internalId)
          ? "read"
          : "none";
        return getContentNodeFromInternalId(internalId, permission);
      })
    );
  }

  if (parentType === "schema") {
    const syncedTables = await RemoteTableModel.findAll({
      where: { connectorId },
    });
    const syncedTablesInternalIds = syncedTables.map((db) => db.internalId);

    const allTablesRes = await fetchTables({
      credentials,
      fromSchema: parentInternalId,
    });
    if (allTablesRes.isErr()) {
      return new Err(allTablesRes.error);
    }
    return new Ok(
      allTablesRes.value.map((row) => {
        const internalId = `${parentInternalId}.${row.name}`;
        const permission = syncedTablesInternalIds.includes(internalId)
          ? "read"
          : "none";
        return getContentNodeFromInternalId(internalId, permission);
      })
    );
  }

  return new Err(new Error(`Invalid parentInternalId: ${parentInternalId}`));
};

/**
 * Retrieves the selected content nodes for a parent in our database.
 * They are the content nodes that we were given access to by the admin.
 */
export const fetchReadNodes = async ({
  connectorId,
}: {
  connectorId: ModelId;
}): Promise<Result<ContentNode[], Error>> => {
  const [availableDatabases, availableSchemas, availableTables] =
    await Promise.all([
      RemoteDatabaseModel.findAll({
        where: { connectorId, permission: "selected" },
      }),
      RemoteSchemaModel.findAll({
        where: { connectorId, permission: "selected" },
      }),
      RemoteTableModel.findAll({
        where: { connectorId, permission: "selected" },
      }),
    ]);

  return new Ok([
    ...availableDatabases.map((db) =>
      getContentNodeFromInternalId(db.internalId, "read")
    ),
    ...availableSchemas.map((schema) =>
      getContentNodeFromInternalId(schema.internalId, "read")
    ),
    ...availableTables.map((table) =>
      getContentNodeFromInternalId(table.internalId, "read")
    ),
  ]);
};

export const fetchSyncedChildren = async ({
  connectorId,
  parentInternalId,
}: {
  connectorId: ModelId;
  parentInternalId: string | null;
}): Promise<Result<ContentNode[], Error>> => {
  if (parentInternalId === null) {
    throw new Error("Should not be called with parentInternalId null.");
  }

  const parentType = getContentNodeTypeFromInternalId(parentInternalId);

  // We want to fetch all the schemas for which we have access to at least one table.
  if (parentType === "database") {
    // If the database is in db with permission: "selected" we have full access to it (it means the user selected this node).
    // That means we have access to all schemas and tables.
    // In that case we loop on all schemas.
    const availableDatabase = await RemoteDatabaseModel.findOne({
      where: {
        connectorId,
        internalId: parentInternalId,
        permission: "selected",
      },
    });
    if (availableDatabase) {
      const schemas = await RemoteSchemaModel.findAll({
        where: {
          connectorId,
          databaseName: parentInternalId,
          permission: ["selected", "inherited"],
        },
      });
      const schemaContentNodes = schemas.map((schema) =>
        getContentNodeFromInternalId(schema.internalId, "read")
      );
      return new Ok(schemaContentNodes);
    }

    // Otherwise, we will fetch all the schemas we have full access to,
    // which are the ones in db with permission: "selected" (the ones with "inherited" are absorbed in the case above).
    // + the schemas for the tables that were explicitly selected.
    const [availableSchemas, availableTables] = await Promise.all([
      RemoteSchemaModel.findAll({
        where: {
          connectorId,
          databaseName: parentInternalId,
          permission: "selected",
        },
      }),
      RemoteTableModel.findAll({
        where: {
          connectorId,
          databaseName: parentInternalId,
          permission: "selected",
        },
      }),
    ]);
    const schemas = availableSchemas.map((schema) =>
      getContentNodeFromInternalId(schema.internalId, "read")
    );
    availableTables.forEach((table) => {
      const schemaToAdd = `${table.databaseName}.${table.schemaName}`;
      if (!schemas.find((s) => s.internalId === schemaToAdd)) {
        schemas.push(getContentNodeFromInternalId(schemaToAdd, "none"));
      }
    });
    return new Ok(schemas);
  }

  // Since we have all tables in the database, we can just return all the tables we have for this schema.
  if (parentType === "schema") {
    const [databaseName, schemaName] = parentInternalId.split(".");
    const availableTables = await RemoteTableModel.findAll({
      where: {
        connectorId,
        databaseName,
        schemaName,
      },
    });
    const tables = availableTables.map((table) =>
      getContentNodeFromInternalId(table.internalId, "read")
    );
    return new Ok(tables);
  }

  return new Ok([]);
};

/**
 * Gets the content nodes for a list of internalIds.
 */
export const getBatchContentNodes = async ({
  connectorId,
  internalIds,
}: {
  connectorId: ModelId;
  internalIds: string[];
}): Promise<Result<ContentNode[], Error>> => {
  const tables = await RemoteTableModel.findAll({
    where: { connectorId },
  });

  const nodes: ContentNode[] = [];
  for (const internalId of internalIds) {
    if (tables.find((table) => table.internalId.startsWith(internalId))) {
      const node = getContentNodeFromInternalId(internalId, "read");
      nodes.push(node);
    }
  }

  return new Ok(nodes);
};

/**
 * Saves the nodes that the user has access to in the database.
 * We save only the nodes that the admin has given us access to.
 * 
 * Example of permissions: {
      "MY_DB.PUBLIC": "read",
      "MY_DB.SAMPLE_DATA.CATS": "read",
      "MY_DB.SAMPLE_DATA.DOGS": "none",
      "MY_OTHER_DB": "node",
    }
 */
export const saveNodesFromPermissions = async ({
  connectorId,
  credentials,
  permissions,
  logger,
}: {
  permissions: Record<string, string>;
  connectorId: ModelId;
  credentials: SnowflakeCredentials;
  logger: Logger;
}): Promise<Result<void, Error>> => {
  for (const [internalId, permission] of Object.entries(permissions)) {
    const [database, schema, table] = internalId.split(".");
    const internalType = getContentNodeTypeFromInternalId(internalId);
    const existingDb = await RemoteDatabaseModel.findOne({
      where: { connectorId, name: database },
    });

    if (internalType === "database") {
      if (permission === "read") {
        if (!existingDb) {
          await RemoteDatabaseModel.create({
            connectorId,
            internalId,
            name: database as string,
            permission: "selected",
          });
        }
        // pushing the schemas in db with permission: "inherited" if they don't already exist
        const fetchedSchemasRes = await fetchSchemas({
          credentials,
          fromDatabase: database,
        });
        if (fetchedSchemasRes.isErr()) {
          return new Err(new Error(fetchedSchemasRes.error.message));
        }
        for (const schema of fetchedSchemasRes.value) {
          const existingSchema = await RemoteSchemaModel.findOne({
            where: {
              connectorId,
              internalId: [database, schema.name].join("."),
            },
          });
          if (!existingSchema) {
            await RemoteSchemaModel.create({
              connectorId,
              internalId: [database, schema.name].join("."),
              name: schema.name,
              databaseName: database as string,
              permission: "inherited",
            });
          } else if (existingSchema.permission === "unselected") {
            // we update the permission to prevent it from being deleted
            // if it was selected we keep it that way, this way unselecting the database will not unselect the schema
            await existingSchema.update({ permission: "inherited" });
          }
        }
      } else if (permission === "none" && existingDb) {
        await existingDb.update({ permission: "unselected" });
      } else {
        logger.error(
          { internalId, permission, existingDb },
          "Invalid permission for database."
        );
      }
      continue;
    }
    if (internalType === "schema") {
      const existingSchema = await RemoteSchemaModel.findOne({
        where: {
          connectorId,
          internalId,
        },
      });
      if (permission === "read") {
        if (!existingSchema) {
          await RemoteSchemaModel.create({
            connectorId,
            internalId,
            name: schema as string,
            databaseName: database as string,
            permission: "selected",
          });
        } else {
          await existingSchema.update({ permission: "selected" });
        }
      } else if (permission === "none" && existingSchema) {
        const permission = existingDb ? "inherited" : "unselected";
        await existingSchema.update({ permission });
      } else {
        logger.error(
          { internalId, permission, existingSchema },
          "Invalid permission for schema."
        );
      }
      continue;
    }
    if (internalType === "table") {
      const existingTable = await RemoteTableModel.findOne({
        where: {
          connectorId,
          internalId,
        },
      });

      if (permission === "read") {
        if (existingTable) {
          await existingTable.update({ permission: "selected" });
        } else {
          await RemoteTableModel.create({
            connectorId,
            internalId,
            name: table as string,
            schemaName: schema as string,
            databaseName: database as string,
            permission: "selected",
          });
        }
      } else if (permission === "none" && existingTable) {
        await existingTable.destroy();
      } else {
        logger.error(
          { internalId, permission, existingTable },
          "Invalid permission for table."
        );
      }
      continue;
    }
  }

  return new Ok(undefined);
};

/**
 * Retrieves the parent IDs of a content node in hierarchical order.
 * The first ID is the internal ID of the content node itself.
 * Quite straightforward for Snowflake as we can extract the parent IDs from the internalId.
 *
 * Note that this part may cause discrepancies between the response of core and the response of the connector since
 * core will consider parents starting from the root (what was selected by the user).
 * If such logs were to pop up they will be ignored.
 */
export const getContentNodeParents = ({
  internalId,
}: {
  internalId: string;
}): Result<string[], Error> => {
  const [database, schema, table] = internalId.split(".");
  const internalType = getContentNodeTypeFromInternalId(internalId);

  if (internalType === "database") {
    return new Ok([internalId]);
  }
  if (internalType === "schema") {
    return new Ok([internalId, `${database}`]);
  }
  if (internalType === "table") {
    return new Ok([internalId, `${database}.${schema}`, `${database}`]);
  }
  return new Err(
    new Error(
      `Invalid internalId: ${internalId}. Extracted: Database=${database}, Schema=${schema}, Table=${table}.`
    )
  );
};
