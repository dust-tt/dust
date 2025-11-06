import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

import {
  fetchCatalogs,
  fetchSchemas,
  fetchTables,
} from "@connectors/connectors/databricks/lib/databricks_api";
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
import type { ContentNode, DatabricksCredentials } from "@connectors/types";
import type { ModelId } from "@connectors/types";
import { INTERNAL_MIME_TYPES } from "@connectors/types";

export const fetchAvailableChildrenInDatabricks = async ({
  connectorId,
  credentials,
  parentInternalId,
}: {
  connectorId: ModelId;
  credentials: DatabricksCredentials;
  parentInternalId: string | null;
}): Promise<Result<ContentNode[], Error>> => {
  if (parentInternalId === null) {
    const syncedDatabases = await RemoteDatabaseModel.findAll({
      where: { connectorId, permission: "selected" },
    });
    const syncedDatabaseIds = syncedDatabases.map((db) => db.internalId);

    const catalogsRes = await fetchCatalogs({ credentials });
    if (catalogsRes.isErr()) {
      return new Err(catalogsRes.error);
    }

    return new Ok(
      catalogsRes.value.map((catalog) => {
        const internalId = buildInternalId({
          databaseName: catalog.name,
        });
        const permission = syncedDatabaseIds.includes(internalId)
          ? "read"
          : "none";
        return getContentNodeFromInternalId(
          internalId,
          permission,
          INTERNAL_MIME_TYPES.DATABRICKS
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
    const syncedSchemaIds = syncedSchemas.map((schema) => schema.internalId);

    const schemasRes = await fetchSchemas({
      credentials,
      catalogName: databaseName,
    });
    if (schemasRes.isErr()) {
      return new Err(schemasRes.error);
    }

    return new Ok(
      schemasRes.value.map((schema) => {
        const internalId = buildInternalId({
          databaseName,
          schemaName: schema.name,
        });
        const permission = syncedSchemaIds.includes(internalId)
          ? "read"
          : "none";
        return getContentNodeFromInternalId(
          internalId,
          permission,
          INTERNAL_MIME_TYPES.DATABRICKS
        );
      })
    );
  }

  if (parentType === "schema") {
    const { databaseName, schemaName } = parseInternalId(parentInternalId);

    const syncedTables = await RemoteTableModel.findAll({
      where: { connectorId },
    });
    const syncedTableIds = new Set(
      syncedTables.map((table) => table.internalId)
    );

    const tablesRes = await fetchTables({
      credentials,
      catalogName: databaseName,
      schemaName: schemaName as string,
    });
    if (tablesRes.isErr()) {
      return new Err(tablesRes.error);
    }

    return new Ok(
      tablesRes.value.map((table) => {
        const internalId = buildInternalId({
          databaseName,
          schemaName: schemaName as string,
          tableName: table.name,
        });
        const permission = syncedTableIds.has(internalId) ? "read" : "none";
        return getContentNodeFromInternalId(
          internalId,
          permission,
          INTERNAL_MIME_TYPES.DATABRICKS
        );
      })
    );
  }

  return new Err(new Error(`Invalid parentInternalId: ${parentInternalId}`));
};

export const fetchSelectedNodes = async ({
  connectorId,
}: {
  connectorId: ModelId;
}): Promise<Result<ContentNode[], Error>> => {
  const [databases, schemas, tables] = await Promise.all([
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
    ...databases.map((db) =>
      getContentNodeFromInternalId(
        db.internalId,
        "read",
        INTERNAL_MIME_TYPES.DATABRICKS
      )
    ),
    ...schemas.map((schema) =>
      getContentNodeFromInternalId(
        schema.internalId,
        "read",
        INTERNAL_MIME_TYPES.DATABRICKS
      )
    ),
    ...tables.map((table) =>
      getContentNodeFromInternalId(
        table.internalId,
        "read",
        INTERNAL_MIME_TYPES.DATABRICKS
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

  if (parentType === "database") {
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

      return new Ok(
        schemas.map((schema) =>
          getContentNodeFromInternalId(
            schema.internalId,
            "read",
            INTERNAL_MIME_TYPES.DATABRICKS
          )
        )
      );
    }

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

    const schemaNodes = availableSchemas.map((schema) =>
      getContentNodeFromInternalId(
        schema.internalId,
        "read",
        INTERNAL_MIME_TYPES.DATABRICKS
      )
    );

    availableTables.forEach((table) => {
      const schemaInternalId = buildInternalId({
        databaseName: table.databaseName,
        schemaName: table.schemaName,
      });
      if (!schemaNodes.find((s) => s.internalId === schemaInternalId)) {
        schemaNodes.push(
          getContentNodeFromInternalId(
            schemaInternalId,
            "none",
            INTERNAL_MIME_TYPES.DATABRICKS
          )
        );
      }
    });

    return new Ok(schemaNodes);
  }

  if (parentType === "schema") {
    const { databaseName, schemaName } = parseInternalId(parentInternalId);

    const tables = await RemoteTableModel.findAll({
      where: {
        connectorId,
        databaseName,
        schemaName,
      },
    });

    return new Ok(
      tables.map((table) =>
        getContentNodeFromInternalId(
          table.internalId,
          table.permission === "selected" ? "read" : "none",
          INTERNAL_MIME_TYPES.DATABRICKS
        )
      )
    );
  }

  return new Ok([]);
};
