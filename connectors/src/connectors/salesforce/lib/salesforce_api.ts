import type { Result } from "@dust-tt/types";
import { concurrentExecutor, Err, Ok, removeNulls } from "@dust-tt/types";
import type { Connection, SavedRecord } from "jsforce";
import jsforce from "jsforce";

import {
  INTERNAL_ID_DATABASE,
  INTERNAL_ID_SCHEMA_CUSTOM,
  INTERNAL_ID_SCHEMA_STANDARD,
  isCustomSchemaInternalId,
  isValidSchemaInternalId,
} from "@connectors/connectors/salesforce/lib/internal_ids";
import type { SalesforceAPICredentials } from "@connectors/connectors/salesforce/lib/oauth";
import { isStandardObjectIncluded } from "@connectors/connectors/salesforce/lib/utils";
import type {
  RemoteDBDatabase,
  RemoteDBSchema,
  RemoteDBTable,
  RemoteDBTree,
} from "@connectors/lib/remote_databases/utils";

const SF_API_VERSION = "57.0";

/**
/**
 * Get a Salesforce connection for the given connection ID.
 */
export const getSalesforceConnection = async (
  credentials: SalesforceAPICredentials
): Promise<Result<Connection, Error>> => {
  const { accessToken, instanceUrl } = credentials;

  try {
    const conn = new jsforce.Connection({
      instanceUrl,
      accessToken,
      version: SF_API_VERSION,
    });
    await conn.identity();
    return new Ok(conn);
  } catch (err) {
    console.error("Connection failed:", err);
    return new Err(new Error("Connection failed"));
  }
};

/**
 * Test the connection to Salesforce with the provided credentials.
 * Used to check if the credentials are valid and the connection is successful.
 */
export async function testSalesforceConnection(
  credentials: SalesforceAPICredentials
): Promise<Result<undefined, Error>> {
  const connRes = await getSalesforceConnection(credentials);
  if (connRes.isErr()) {
    return new Err(new Error("Connection failed"));
  }
  const conn = connRes.value;

  try {
    await conn.identity();
    return new Ok(undefined);
  } catch (err) {
    // TODO(salesforce): Handle different error types.
    console.error("Can't connect to Salesforce:", err);
    return new Err(new Error("Can't connect to Salesforce."));
  }
}

/**
 * Fetch the databases available in the Salesforce account.
 * In Salesforce, databases are the equivalent of projects.
 * Credentials are scoped to a project, so we can't fetch the databases of another project.
 */
export const fetchDatabases = (): RemoteDBDatabase[] => {
  // Salesforce do not have a concept of databases per say, the most similar concept is a project.
  // Since credentials are always scoped to a project, we directly return a single database with the project name.
  return [{ name: INTERNAL_ID_DATABASE }];
};

/**
 * Fetch the schemas available in the Salesforce account.
 * In Salesforce, we have two types of objects: standard and custom.
 * We fetch them separately and return them as two different schemas.
 */
export const fetchSchemas = (): RemoteDBSchema[] => {
  return [
    {
      name: INTERNAL_ID_SCHEMA_STANDARD,
      database_name: INTERNAL_ID_DATABASE,
    },
    {
      name: INTERNAL_ID_SCHEMA_CUSTOM,
      database_name: INTERNAL_ID_DATABASE,
    },
  ];
};

/**
 * Fetch the tables available in the Salesforce account.
 * In Salesforce, objects are the equivalent of tables.
 */
export async function fetchTables({
  credentials,
  parentInternalId,
}: {
  credentials: SalesforceAPICredentials;
  parentInternalId: string;
}): Promise<Result<Array<RemoteDBTable>, Error>> {
  // Validate parent schema.
  if (!isValidSchemaInternalId(parentInternalId)) {
    return new Err(new Error(`Invalid schema: ${parentInternalId}`));
  }
  const isCustomSchema = isCustomSchemaInternalId(parentInternalId);
  const schemaName = isCustomSchema
    ? INTERNAL_ID_SCHEMA_CUSTOM
    : INTERNAL_ID_SCHEMA_STANDARD;

  // Get a Salesforce connection.
  const connRes = await getSalesforceConnection(credentials);
  if (connRes.isErr()) {
    return new Err(new Error("Can't connect to Salesforce."));
  }

  // Fetch the tables.
  try {
    const tables = await connRes.value.describeGlobal();

    return new Ok(
      tables.sobjects
        .filter((obj) => (isCustomSchema ? obj.custom : !obj.custom))
        .filter((obj) => {
          return isCustomSchema ? true : isStandardObjectIncluded(obj.name);
        })
        .map((obj) => ({
          name: obj.name,
          database_name: INTERNAL_ID_DATABASE,
          schema_name: schemaName,
        }))
    );
  } catch (err) {
    console.error("Connection failed:", err);
    return new Err(new Error("Connection failed"));
  }
}

/**
 * Fetch the tree of the Salesforce account.
 */
export const fetchTree = async ({
  credentials,
}: {
  credentials: SalesforceAPICredentials;
}): Promise<Result<RemoteDBTree, Error>> => {
  const databases = await fetchDatabases();
  const schemas = await fetchSchemas();
  const tree = {
    databases: await Promise.all(
      databases.map(async (db) => {
        return {
          ...db,
          schemas: await Promise.all(
            schemas
              .filter((s) => s.database_name === db.name)
              .map(async (schema) => {
                const tablesRes = await fetchTables({
                  credentials,
                  parentInternalId: `${schema.database_name}.${schema.name}`,
                });
                if (tablesRes.isErr()) {
                  throw tablesRes.error;
                }
                const tables = tablesRes.value;

                return {
                  ...schema,
                  tables,
                };
              })
          ),
        };
      })
    ),
  };

  return new Ok(tree);
};

/**
 * Find the tables that have a text area field.
 * Those are the tables that we need to sync for rich text fields,
 * as they can contain a lot of text and we want to do semantic search on them.
 */
/**
 * Find the tables that have a text area field and return the textarea fields for each table.
 * Those are the tables that we need to sync for rich text fields,
 * as they can contain a lot of text and we want to do semantic search on them.
 */
export const findTablesWithTextAreaFields = async (
  credentials: SalesforceAPICredentials,
  tables: { name: string; internalId: string }[]
): Promise<
  Result<
    Array<{ name: string; internalId: string; textAreaFields: string[] }>,
    Error
  >
> => {
  // Get a Salesforce connection.
  const connRes = await getSalesforceConnection(credentials);
  if (connRes.isErr()) {
    return new Err(new Error("Can't connect to Salesforce."));
  }

  const results = await concurrentExecutor(
    tables,
    async (table) => {
      try {
        const objectDescribe = await connRes.value.describe(table.name);

        // Skip system/internal objects.
        if (
          !objectDescribe.createable ||
          !objectDescribe.queryable ||
          objectDescribe.recordTypeInfos.length === 0
        ) {
          return null;
        }

        // objectDescribe.fields.forEach((field) => {
        //   console.log(field.name, field.type, field.length);
        // });

        // Get all textarea fields that have more than 255 characters.
        const textAreaFields = objectDescribe.fields
          .filter(
            (field) =>
              (field.type === "textarea" ||
                field.type === "longtextarea" ||
                field.type === "richtextarea") &&
              field.length > 255
          )
          .map((field) => field.name);

        // Only return tables that have at least one textarea field
        return textAreaFields.length > 0
          ? { name: table.name, internalId: table.internalId, textAreaFields }
          : null;
      } catch (error) {
        console.error(`Error describing ${table}: ${error}`);
        return null;
      }
    },
    { concurrency: 8 }
  );

  const tablesWithTextAreaFields = removeNulls(results);

  return new Ok(tablesWithTextAreaFields);
};

/**
 * Get records for a given object from Salesforce with cursor support.
 * Returns a batch of records and the next cursor for pagination.
 */
export async function getSalesforceObjectRecords({
  credentials,
  objectName,
  connection,
  nextRecordsUrl = null,
  batchSize = 200,
}: {
  credentials: SalesforceAPICredentials;
  objectName: string;
  connection?: Connection;
  nextRecordsUrl?: string | null;
  batchSize?: number;
}): Promise<
  Result<
    {
      records: SavedRecord[];
      totalSize: number;
      done: boolean;
      nextRecordsUrl: string | undefined;
    },
    Error
  >
> {
  let conn = connection;
  if (!conn) {
    const connRes = await getSalesforceConnection(credentials);
    if (connRes.isErr()) {
      return new Err(connRes.error);
    }
    conn = connRes.value;
  }

  try {
    let result;

    if (nextRecordsUrl) {
      // If we have a cursor, use queryMore to get the next batch
      result = await conn.queryMore(nextRecordsUrl);
    } else {
      // Initial query with the specified batch size
      result = await conn.query(
        `SELECT FIELDS(ALL) FROM ${objectName} LIMIT ${Math.min(
          batchSize,
          200
        )}`
      );
    }

    return new Ok({
      records: result.records as SavedRecord[],
      totalSize: result.totalSize,
      done: result.done,
      nextRecordsUrl: result.done ? undefined : result.nextRecordsUrl,
    });
  } catch (error) {
    return new Err(error instanceof Error ? error : new Error(String(error)));
  }
}
