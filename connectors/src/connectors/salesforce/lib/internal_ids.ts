export const INTERNAL_ID_DATABASE = "SALESFORCE_PROJECT";
export const INTERNAL_ID_SCHEMA_STANDARD = "STANDARD_OBJECTS";
export const INTERNAL_ID_SCHEMA_CUSTOM = "CUSTOM_OBJECTS";

export const isValidSchemaInternalId = (internalId: string): boolean => {
  const [database, schema] = internalId.split(".");
  return (
    database === INTERNAL_ID_DATABASE &&
    (schema === INTERNAL_ID_SCHEMA_STANDARD ||
      schema === INTERNAL_ID_SCHEMA_CUSTOM)
  );
};

export const isCustomSchemaInternalId = (internalId: string): boolean => {
  const [database, schema] = internalId.split(".");
  return (
    database === INTERNAL_ID_DATABASE && schema === INTERNAL_ID_SCHEMA_CUSTOM
  );
};
