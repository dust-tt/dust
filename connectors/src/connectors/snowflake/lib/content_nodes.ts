import type { ConnectorPermission, ContentNode } from "@dust-tt/types";

/**
 * 3 types of nodes in a remote database content tree:
 * - database: internalId = "database_name"
 * - schema: internalId = "database_name.schema_name"
 * - table: internalId = "database_name.schema_name.table_name"
 */
export type REMOTE_DB_CONTENT_NODE_TYPES = "database" | "schema" | "table";

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
  permission: ConnectorPermission = "none"
): ContentNode => {
  const type = getContentNodeTypeFromInternalId(internalId);
  const [databaseName, schemaName, tableName] = internalId.split(".");

  if (type === "database") {
    return {
      provider: "snowflake",
      internalId: databaseName as string,
      parentInternalId: null,
      type: "folder",
      title: databaseName as string,
      sourceUrl: null,
      expandable: true,
      preventSelection: false,
      permission,
      dustDocumentId: null,
      lastUpdatedAt: null,
    };
  }
  if (type === "schema") {
    return {
      provider: "snowflake",
      internalId: `${databaseName}.${schemaName}`,
      parentInternalId: databaseName as string,
      type: "folder",
      title: schemaName as string,
      sourceUrl: null,
      expandable: true,
      preventSelection: false,
      permission,
      dustDocumentId: null,
      lastUpdatedAt: null,
    };
  }
  if (type === "table") {
    return {
      provider: "snowflake",
      internalId: `${databaseName}.${schemaName}.${tableName}`,
      parentInternalId: `${databaseName}.${schemaName}`,
      type: "database",
      title: tableName as string,
      sourceUrl: null,
      expandable: false,
      preventSelection: false,
      permission,
      dustDocumentId: null,
      lastUpdatedAt: null,
    };
  }
  throw new Error(`Invalid internalId: ${internalId}`);
};
