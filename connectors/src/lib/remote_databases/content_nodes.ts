import type {
  ConnectorPermission,
  ContentNode,
  MIME_TYPES,
} from "@dust-tt/types";

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
  const parts = internalId.split(".");

  if (parts.length === 1) {
    return "database";
  }
  if (parts.length === 2) {
    return "schema";
  }
  if (parts.length === 3) {
    return "table";
  }
  throw new Error(`Invalid internalId: ${internalId}`);
};

export const getContentNodeFromInternalId = (
  internalId: string,
  permission: ConnectorPermission = "none",
  mimeTypes: typeof MIME_TYPES.BIGQUERY | typeof MIME_TYPES.SNOWFLAKE
): ContentNode => {
  const type = getContentNodeTypeFromInternalId(internalId);
  const [databaseName, schemaName, tableName] = internalId.split(".");

  if (type === "database") {
    return {
      internalId: databaseName as string,
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
      internalId: `${databaseName}.${schemaName}`,
      parentInternalId: databaseName as string,
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
      internalId: `${databaseName}.${schemaName}.${tableName}`,
      parentInternalId: `${databaseName}.${schemaName}`,
      type: "database",
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
