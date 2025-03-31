import {
  buildInternalId,
  parseInternalId,
} from "@connectors/lib/remote_databases/utils";
import type {
  ConnectorPermission,
  ContentNode,
  INTERNAL_MIME_TYPES,
} from "@connectors/types";
/**
 * 3 types of nodes in a remote database content tree:
 * - database: internalId = "database_name"
 * - schema: internalId = "database_name.schema_name"
 * - table: internalId = "database_name.schema_name.table_name"
 */
type REMOTE_DB_CONTENT_NODE_TYPES = "database" | "schema" | "table";

export const getContentNodeTypeFromInternalId = (
  internalId: string
): REMOTE_DB_CONTENT_NODE_TYPES => {
  const { databaseName, schemaName, tableName } = parseInternalId(internalId);

  if (tableName) {
    return "table";
  } else if (schemaName) {
    return "schema";
  } else if (databaseName) {
    return "database";
  }

  throw new Error(`Invalid internalId: ${internalId}`);
};

export const getContentNodeFromInternalId = (
  internalId: string,
  permission: ConnectorPermission = "none",
  mimeTypes:
    | typeof INTERNAL_MIME_TYPES.BIGQUERY
    | typeof INTERNAL_MIME_TYPES.SNOWFLAKE
    | typeof INTERNAL_MIME_TYPES.SALESFORCE
): ContentNode => {
  const type = getContentNodeTypeFromInternalId(internalId);
  const { databaseName, schemaName, tableName } = parseInternalId(internalId);

  if (type === "database") {
    return {
      internalId: buildInternalId({
        databaseName: databaseName as string,
      }),
      parentInternalId: null,
      type: "folder",
      title: databaseName as string,
      sourceUrl: null,
      expandable: true,
      preventSelection: false,
      permission,
      lastUpdatedAt: null,
      mimeType: mimeTypes.DATABASE,
    };
  }
  if (type === "schema") {
    return {
      internalId: buildInternalId({
        databaseName: databaseName as string,
        schemaName: schemaName as string,
      }),
      parentInternalId: buildInternalId({
        databaseName: databaseName as string,
      }),
      type: "folder",
      title: schemaName as string,
      sourceUrl: null,
      expandable: true,
      preventSelection: false,
      permission,
      lastUpdatedAt: null,
      mimeType: mimeTypes.SCHEMA,
    };
  }
  if (type === "table") {
    return {
      internalId: buildInternalId({
        databaseName: databaseName as string,
        schemaName: schemaName as string,
        tableName: tableName as string,
      }),
      parentInternalId: buildInternalId({
        databaseName: databaseName as string,
        schemaName: schemaName as string,
      }),
      type: "table",
      title: tableName as string,
      sourceUrl: null,
      expandable: false,
      preventSelection: false,
      permission,
      lastUpdatedAt: null,
      mimeType: mimeTypes.TABLE,
    };
  }
  throw new Error(`Invalid internalId: ${internalId}`);
};
