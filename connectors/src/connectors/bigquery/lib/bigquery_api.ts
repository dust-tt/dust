import { concurrentExecutor } from "@connectors/lib/async_utils";
import type {
  RemoteDBDatabase,
  RemoteDBSchema,
  RemoteDBTable,
  RemoteDBTree,
} from "@connectors/lib/remote_databases/utils";
import type { Logger } from "@connectors/logger/logger";
import type { BigQueryCredentialsWithLocation } from "@connectors/types";
import { isBigqueryPermissionsError } from "@connectors/types/bigquery";
import type { Result } from "@dust-tt/client";
import { Err, normalizeError, Ok, removeNulls } from "@dust-tt/client";
import { BigQuery } from "@google-cloud/bigquery";
import { listAccessibleProjects } from "./bigquery_projects";
import {
  pinGoogleOAuthTokenUri,
  withBigQueryStaticIpProxy,
} from "./bigquery_proxy";

const MAX_TABLES_PER_SCHEMA = 1500;
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
  const bigQuery = connectToBigQuery(credentials, credentials.project_id);
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
  credentials: BigQueryCredentialsWithLocation,
  projectId: string
): BigQuery {
  // Reject non-Google token endpoints before any outbound auth/API traffic.
  // Node gtoken hardcodes Google's token URL, but pinning still blocks crafted
  // credentials at the boundary (and matches core's proxied exchange guards).
  pinGoogleOAuthTokenUri(credentials.token_uri);

  // Use the static IP proxy when configured so BigQuery REST + token minting
  // share the same allowlisted egress IP as Snowflake (customers IP-restrict
  // warehouse access).
  return new BigQuery(
    withBigQueryStaticIpProxy({
      credentials,
      scopes: ["https://www.googleapis.com/auth/bigquery.readonly"],
      location: credentials.location,
      retryOptions: {
        autoRetry: true,
        maxRetries: 3,
      },
      projectId,
    })
  );
}

export const fetchDatabases = async ({
  credentials,
  logger,
}: {
  credentials: BigQueryCredentialsWithLocation;
  logger?: Logger;
}): Promise<Array<RemoteDBDatabase>> => {
  // BigQuery do not have a concept of databases per say, the most similar concept is a project.

  // A service account can have access to multiple projects.
  // We start by the project the credentials are scoped to.
  let projectIds: string[] = [credentials.project_id];
  try {
    const projects = await listAccessibleProjects(credentials);
    // And then we add the other projects the service account has access to.
    projectIds = [
      ...projectIds,
      ...projects
        .filter((project) => project.projectId)
        .map((project) => project.projectId!),
    ];
  } catch (error) {
    logger?.error({ error }, "Error listing accessible projects");
  }

  return Array.from(new Set(projectIds)).map((projectId) => ({
    name: projectId,
  }));
};

/**
 * Fetch the datasets available in the BigQuery account.
 * In BigQuery, datasets are the equivalent of schemas.
 * Credentials are scoped to a project, so we can't fetch the datasets of another project.
 */
export const fetchDatasets = async ({
  credentials,
  database,
  connection,
  logger,
}: {
  credentials: BigQueryCredentialsWithLocation;
  database: RemoteDBDatabase;
  connection?: BigQuery;
  logger?: Logger;
}): Promise<Result<Array<RemoteDBSchema>, Error>> => {
  const conn = connection ?? connectToBigQuery(credentials, database.name);
  try {
    const r = await conn.getDatasets();
    const datasets = r[0];
    if (logger) {
      logger.info(
        {
          datasetsCount: datasets.length,
        },
        "[BigQuery] fetchDatasets"
      );
    }
    return new Ok(
      removeNulls(
        datasets.map((dataset) => {
          // Strict location matching: only keep datasets whose location exactly matches
          // the credential's location (case-insensitive). No regional/multi-region expansion.
          const datasetLocation = dataset.location?.toLowerCase();
          const credentialLocation = credentials.location.toLowerCase();
          if (!datasetLocation || datasetLocation !== credentialLocation) {
            return null;
          }

          if (!dataset.id) {
            return null;
          }
          return {
            name: dataset.id,
            database_name: database.name,
          };
        })
      )
    );
  } catch (error) {
    const e = normalizeError(error);
    // Sometimes the service account has access to a multiple projects, but one of them has not enabled BigQuery
    // or the project has been deleted. In that case, we skip the project and return an empty array.
    if (
      e.message.includes("has not enabled BigQuery") ||
      e.message.includes("has been deleted")
    ) {
      logger?.info(
        { database: database.name, error: e.message },
        "[BigQuery] Skipping project"
      );
      return new Ok([]);
    }
    return new Err(e);
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
  logger,
}: {
  credentials: BigQueryCredentialsWithLocation;
  dataset: RemoteDBSchema;
  fetchTablesDescription: boolean;
  connection?: BigQuery;
  logger?: Logger;
}): Promise<Result<Array<RemoteDBTable>, Error>> => {
  const conn =
    connection ?? connectToBigQuery(credentials, dataset.database_name);
  try {
    // Can't happen, to please TS.
    if (!dataset) {
      throw new Error("Dataset name is required");
    }

    // Get the dataset specified by the schema
    const d = conn.dataset(dataset.name);

    // We paginate tables to avoid loading too many Table objects
    // in memory at once.
    const remoteDBTables: RemoteDBTable[] = [];

    let nextQuery:
      | {
          autoPaginate: false;
          maxResults: number;
          pageToken?: string;
          // Additional fields are forwarded to the BigQuery tables.list API.
          // We rely on this to request specific fields when needed.
          selectedFields?: string;
          view?: string;
        }
      | undefined = {
      autoPaginate: false,
      maxResults: 32,
      // Only request identifying fields; description is fetched via table.getMetadata
      selectedFields: "tables(tableReference),nextPageToken",
    };

    while (nextQuery) {
      const [tables, q] = await d.getTables(nextQuery as never);

      logger?.info(
        {
          tablesCount: tables.length,
          dataset,
          pageToken: nextQuery.pageToken,
        },
        "[BigQuery] dataset.getTables (paginated)"
      );

      for (const table of tables) {
        if (!table.id) {
          continue;
        }

        if (fetchTablesDescription) {
          try {
            const metadata = await table.getMetadata();
            logger?.info(
              {
                dataset,
                table: table.id,
              },
              "[BigQuery] table.getMetadata"
            );
            remoteDBTables.push({
              name: table.id,
              database_name: dataset.database_name,
              schema_name: dataset.name,
              description: metadata[0].description,
            });
          } catch (error) {
            if (isBigqueryPermissionsError(error)) {
              logger?.warn(
                {
                  projectId: dataset.database_name,
                  dataset,
                  table: table.id,
                  error: normalizeError(error).message,
                },
                "[BigQuery] Permission denied accessing table metadata, skipping table"
              );
              continue;
            }
            throw error;
          }
        } else {
          remoteDBTables.push({
            name: table.id,
            database_name: dataset.database_name,
            schema_name: dataset.name,
          });
        }
      }

      nextQuery = q as typeof nextQuery;
    }

    return new Ok(remoteDBTables);
  } catch (error) {
    return new Err(normalizeError(error));
  }
};

/**
 * @cc [owner:aubin-tchoi,label:performance] skip-oversized-datasets-before-enumeration
 * When tables.list reports more than MAX_TABLES_PER_SCHEMA tables, skip the dataset without
 * fetching subsequent table pages or table descriptions.
 */
export const fetchTree = async ({
  credentials,
  fetchTablesDescription,
  logger,
}: {
  credentials: BigQueryCredentialsWithLocation;
  fetchTablesDescription: boolean;
  logger: Logger;
}): Promise<Result<RemoteDBTree, Error>> => {
  const databases = await fetchDatabases({ credentials });

  const tree = {
    databases: await concurrentExecutor(
      databases,
      async (db) => {
        const schemasRes = await fetchDatasets({
          credentials,
          database: db,
          logger,
        });
        if (schemasRes.isErr()) {
          throw schemasRes.error;
        }
        const schemas = schemasRes.value;
        return {
          ...db,
          schemas: await concurrentExecutor(
            schemas,
            async (schema) => {
              const connection = connectToBigQuery(credentials, db.name);
              const [, , tableList] = await connection
                .dataset(schema.name)
                .getTables({ autoPaginate: false, maxResults: 1 });

              let tables: RemoteDBTable[] = [];
              if ((tableList?.totalItems ?? 0) <= MAX_TABLES_PER_SCHEMA) {
                const tablesRes = await fetchTables({
                  credentials,
                  dataset: schema,
                  fetchTablesDescription,
                  connection,
                  logger,
                });
                if (tablesRes.isErr()) {
                  throw tablesRes.error;
                }
                tables = tablesRes.value;
              }
              const tablesCount = Math.max(
                tableList?.totalItems ?? 0,
                tables.length
              );

              // Do not store if too many tables, the sync will be too long and it's quite likely that these are useless tables.
              if (tablesCount > MAX_TABLES_PER_SCHEMA) {
                logger.warn(
                  `[BigQuery] Skipping schema ${schema.name} with ${tablesCount} tables because it has more than ${MAX_TABLES_PER_SCHEMA} tables.`
                );
                return {
                  name:
                    schema.name +
                    ` (sync skipped: exceeded ${MAX_TABLES_PER_SCHEMA} tables limit)`,
                  database_name: db.name,
                  tables: [],
                };
              }

              return {
                ...schema,
                tables,
              };
            },
            { concurrency: 2 }
          ),
        };
      },
      { concurrency: 2 }
    ),
  };

  return new Ok(tree);
};

// BigQuery is read-only as we force the readonly scope when creating the client.
export const isConnectionReadonly = () => new Ok(undefined);
