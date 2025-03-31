import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

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
import {
  buildInternalId,
  parseInternalId,
} from "@connectors/lib/remote_databases/utils";
import type { ContentNode, SnowflakeCredentials } from "@connectors/types";
import type { ModelId } from "@connectors/types";
import {
  EXCLUDE_DATABASES,
  EXCLUDE_SCHEMAS,
  INTERNAL_MIME_TYPES,
} from "@connectors/types";
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
        const internalId = buildInternalId({
          databaseName: row.name,
        });
        const permission = syncedDatabasesInternalIds.includes(internalId)
          ? "read"
          : "none";
        return getContentNodeFromInternalId(
          internalId,
          permission,
          INTERNAL_MIME_TYPES.SNOWFLAKE
        );
      })
    );
  }

  const parentType = getContentNodeTypeFromInternalId(parentInternalId);

  if (parentType === "database") {
    const { databaseName } = parseInternalId(parentInternalId);
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
        const internalId = buildInternalId({
          databaseName,
          schemaName: row.name,
        });
        const permission = syncedSchemasInternalIds.includes(internalId)
          ? "read"
          : "none";
        return getContentNodeFromInternalId(
          internalId,
          permission,
          INTERNAL_MIME_TYPES.SNOWFLAKE
        );
      })
    );
  }

  if (parentType === "schema") {
    const { databaseName, schemaName } = parseInternalId(parentInternalId);
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
        const internalId = buildInternalId({
          databaseName,
          schemaName,
          tableName: row.name,
        });
        const permission = syncedTablesInternalIds.includes(internalId)
          ? "read"
          : "none";
        return getContentNodeFromInternalId(
          internalId,
          permission,
          INTERNAL_MIME_TYPES.SNOWFLAKE
        );
      })
    );
  }

  return new Err(new Error(`Invalid parentInternalId: ${parentInternalId}`));
};

/**
 * Retrieves the selected content nodes in our database. They are the content nodes that we were
 * given access to by the admin.
 */
export const fetchSelectedNodes = async ({
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
      getContentNodeFromInternalId(
        db.internalId,
        "read",
        INTERNAL_MIME_TYPES.SNOWFLAKE
      )
    ),
    ...availableSchemas.map((schema) =>
      getContentNodeFromInternalId(
        schema.internalId,
        "read",
        INTERNAL_MIME_TYPES.SNOWFLAKE
      )
    ),
    ...availableTables.map((table) =>
      getContentNodeFromInternalId(
        table.internalId,
        "read",
        INTERNAL_MIME_TYPES.SNOWFLAKE
      )
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
    // If the database is in db with permission: "selected" we have full access to it (it means the
    // user selected this node). That means we have access to all schemas and tables.  In that case
    // we loop on all schemas.
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
        getContentNodeFromInternalId(
          schema.internalId,
          "read",
          INTERNAL_MIME_TYPES.SNOWFLAKE
        )
      );
      return new Ok(schemaContentNodes);
    }

    // Otherwise, we will fetch all the schemas we have full access to, which are the ones in db
    // with permission: "selected" (the ones with "inherited" are absorbed in the case above) +
    // the schemas for the tables that were explicitly selected.
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
      getContentNodeFromInternalId(
        schema.internalId,
        "read",
        INTERNAL_MIME_TYPES.SNOWFLAKE
      )
    );
    availableTables.forEach((table) => {
      const schemaToAddInternalId = buildInternalId({
        databaseName: table.databaseName,
        schemaName: table.schemaName,
      });
      if (!schemas.find((s) => s.internalId === schemaToAddInternalId)) {
        schemas.push(
          getContentNodeFromInternalId(
            schemaToAddInternalId,
            "none",
            INTERNAL_MIME_TYPES.SNOWFLAKE
          )
        );
      }
    });
    return new Ok(schemas);
  }

  // Since we have all tables in the database, we can just return all the tables we have for this
  // schema.
  if (parentType === "schema") {
    const { databaseName, schemaName } = parseInternalId(parentInternalId);
    const availableTables = await RemoteTableModel.findAll({
      where: {
        connectorId,
        databaseName,
        schemaName,
      },
    });
    const tables = availableTables.map((table) =>
      getContentNodeFromInternalId(
        table.internalId,
        "read",
        INTERNAL_MIME_TYPES.SNOWFLAKE
      )
    );
    return new Ok(tables);
  }

  return new Ok([]);
};
