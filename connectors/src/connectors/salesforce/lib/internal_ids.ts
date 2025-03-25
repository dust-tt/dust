import { parseInternalId } from "@connectors/lib/remote_databases/utils";

export const INTERNAL_ID_DATABASE = "SALESFORCE_PROJECT";
export const INTERNAL_ID_SCHEMA_STANDARD = "STANDARD_OBJECTS";
export const INTERNAL_ID_SCHEMA_CUSTOM = "CUSTOM_OBJECTS";

export const isValidSchemaInternalId = (internalId: string): boolean => {
  const { databaseName, schemaName } = parseInternalId(internalId);
  return (
    databaseName === INTERNAL_ID_DATABASE &&
    (schemaName === INTERNAL_ID_SCHEMA_STANDARD ||
      schemaName === INTERNAL_ID_SCHEMA_CUSTOM)
  );
};

export const isCustomSchemaInternalId = (internalId: string): boolean => {
  const { databaseName, schemaName } = parseInternalId(internalId);
  return (
    databaseName === INTERNAL_ID_DATABASE &&
    schemaName === INTERNAL_ID_SCHEMA_CUSTOM
  );
};
