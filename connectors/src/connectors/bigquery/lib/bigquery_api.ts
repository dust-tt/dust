import type { Result } from "@dust-tt/client";
import { Err, Ok, removeNulls } from "@dust-tt/client";
import { BigQuery } from "@google-cloud/bigquery";

import { concurrentExecutor } from "@connectors/lib/async_utils";
import type {
  RemoteDBDatabase,
  RemoteDBSchema,
  RemoteDBTable,
  RemoteDBTree,
} from "@connectors/lib/remote_databases/utils";
import logger from "@connectors/logger/logger";
import type { BigQueryCredentialsWithLocation } from "@connectors/types";
import { isBigqueryPermissionsError } from "@connectors/types/bigquery";

const MAX_TABLES_PER_SCHEMA = 1000;
type TestConnectionErrorCode = "INVALID_CREDENTIALS" | "UNKNOWN";

export class TestConnectionError extends Error {
  code: TestConnectionErrorCode;

  constructor(code: TestConnectionErrorCode, message: string) {
    super(message);
    this.name = "TestBigQueryConnectionError";
    this.code = code;
  }
}

export function isTestConnectionError(
  error: Error
): error is TestConnectionError {
  return error.name === "TestBigQueryConnectionError";
}

/**
 * Test the connection to BigQuery with the provided credentials.
 * Used to check if the credentials are valid and the connection is successful.
 */
export const testConnection = async ({
  credentials,
}: {
  credentials: BigQueryCredentialsWithLocation;
}): Promise<Result<string, TestConnectionError>> => {
  // Connect to bigquery, do a simple query.
  const bigQuery = connectToBigQuery(credentials);
  try {
    await bigQuery.query("SELECT 1");
    return new Ok("Connection successful");
  } catch (error: unknown) {
    if (error instanceof Error) {
      return new Err(
        new TestConnectionError("INVALID_CREDENTIALS", error.message)
      );
    }
    return new Err(
      new TestConnectionError("INVALID_CREDENTIALS", "Unknown error occurred")
    );
  }
};

export function connectToBigQuery(
  credentials: BigQueryCredentialsWithLocation
): BigQuery {
  return new BigQuery({
    credentials,
    scopes: ["https://www.googleapis.com/auth/bigquery.readonly"],
    location: credentials.location,
  });
}

export const fetchDatabases = ({
  credentials,
}: {
  credentials: BigQueryCredentialsWithLocation;
}): RemoteDBDatabase[] => {
  // BigQuery do not have a concept of databases per say, the most similar concept is a project.
  // Since credentials are always scoped to a project, we directly return a single database with the project name.
  return [{ name: credentials.project_id }];
};

/**
 * Fetch the datasets available in the BigQuery account.
 * In BigQuery, datasets are the equivalent of schemas.
 * Credentials are scoped to a project, so we can't fetch the datasets of another project.
 */
export const fetchDatasets = async ({
  credentials,
  connection,
}: {
  credentials: BigQueryCredentialsWithLocation;
  connection?: BigQuery;
}): Promise<Result<Array<RemoteDBSchema>, Error>> => {
  const conn = connection ?? connectToBigQuery(credentials);
  try {
    const r = await conn.getDatasets();
    const datasets = r[0];
    return new Ok(
      removeNulls(
        datasets.map((dataset) => {
          // We want to filter out datasets that are in a different location than the credentials.
          // But, for example, we want to keep dataset in "us" (multi-region) when selected location is "us-central1" (regional)
          if (
            !credentials.location
              .toLowerCase()
              .startsWith(dataset.location?.toLowerCase() ?? "")
          ) {
            return null;
          }

          if (!dataset.id) {
            return null;
          }
          return {
            name: dataset.id,
            database_name: credentials.project_id,
          };
        })
      )
    );
  } catch (error) {
    return new Err(error instanceof Error ? error : new Error(String(error)));
  }
};

/**
 * Fetch the tables available in the BigQuery dataset.
 */
export const fetchTables = async ({
  credentials,
  dataset,
  fetchTablesDescription,
  connection,
}: {
  credentials: BigQueryCredentialsWithLocation;
  dataset: string;
  fetchTablesDescription: boolean;
  connection?: BigQuery;
}): Promise<Result<Array<RemoteDBTable>, Error>> => {
  const conn = connection ?? connectToBigQuery(credentials);
  try {
    // Can't happen, to please TS.
    if (!dataset) {
      throw new Error("Dataset name is required");
    }

    // Get the dataset specified by the schema
    const d = await conn.dataset(dataset);
    const r = await d.getTables();
    const tables = r[0];

    const remoteDBTables: RemoteDBTable[] = removeNulls(
      await concurrentExecutor(
        tables,
        async (table) => {
          if (!table.id) {
            return null;
          }
          if (fetchTablesDescription) {
            try {
              const metadata = await table.getMetadata();
              return {
                name: table.id!,
                database_name: credentials.project_id,
                schema_name: dataset,
                description: metadata[0].description,
              };
            } catch (error) {
              // Handle BigQuery permission errors gracefully
              if (isBigqueryPermissionsError(error)) {
                const errorMessage =
                  error &&
                  typeof error === "object" &&
                  "message" in error &&
                  typeof error.message === "string"
                    ? error.message
                    : "Permission denied";
                logger.warn(
                  {
                    projectId: credentials.project_id,
                    dataset,
                    table: table.id,
                    error: errorMessage,
                  },
                  "[BigQuery] Permission denied accessing table metadata, skipping table"
                );
                // Skip tables when we lack permissions
                return null;
              }
              // Re-throw other errors
              throw error;
            }
          } else {
            return {
              name: table.id!,
              database_name: credentials.project_id,
              schema_name: dataset,
            };
          }
        },
        {
          concurrency: 10,
        }
      )
    );

    return new Ok(remoteDBTables);
  } catch (error) {
    return new Err(error instanceof Error ? error : new Error(String(error)));
  }
};

export const fetchTree = async ({
  credentials,
  fetchTablesDescription,
}: {
  credentials: BigQueryCredentialsWithLocation;
  fetchTablesDescription: boolean;
}): Promise<Result<RemoteDBTree, Error>> => {
  const databases = await fetchDatabases({ credentials });

  const schemasRes = await fetchDatasets({ credentials });
  if (schemasRes.isErr()) {
    return schemasRes;
  }
  const schemas = schemasRes.value;

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
                  dataset: schema.name,
                  fetchTablesDescription,
                });
                if (tablesRes.isErr()) {
                  throw tablesRes.error;
                }
                const tables = tablesRes.value;

                // Do not store if too many tables, the sync will be too long and it's quite likely that these are useless tables.
                if (tables.length > MAX_TABLES_PER_SCHEMA) {
                  logger.warn(
                    `[BigQuery] Skipping schema ${schema.name} with ${tables.length} tables because it has more than ${MAX_TABLES_PER_SCHEMA} tables.`
                  );
                  return {
                    name:
                      schema.name +
                      ` (sync skipped: exceeded ${MAX_TABLES_PER_SCHEMA} tables limit)`,
                    database_name: credentials.project_id,
                    tables: [],
                  };
                }

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

// BigQuery is read-only as we force the readonly scope when creating the client.
export const isConnectionReadonly = () => new Ok(undefined);
