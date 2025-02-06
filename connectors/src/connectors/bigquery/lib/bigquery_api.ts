import type { BigQueryCredentialsWithLocation, Result } from "@dust-tt/types";
import { Err, Ok, removeNulls } from "@dust-tt/types";
import { BigQuery } from "@google-cloud/bigquery";

import type {
  RemoteDBDatabase,
  RemoteDBSchema,
  RemoteDBTable,
} from "@connectors/lib/remote_databases/utils";
import { parseSchemaInternalId } from "@connectors/lib/remote_databases/utils";

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
          // We want to filter out datasets that are not in the same location as the credentials.
          // But, for example, we want to keep dataset in "us-central1" when selected location is "us"
          if (
            dataset.location?.toLowerCase() !==
            credentials.location.toLowerCase()
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
  datasetName,
  internalDatasetId,
  connection,
}: {
  credentials: BigQueryCredentialsWithLocation;
  datasetName?: string;
  internalDatasetId?: string;
  connection?: BigQuery;
}): Promise<Result<Array<RemoteDBTable>, Error>> => {
  const conn = connection ?? connectToBigQuery(credentials);
  try {
    if (!datasetName && !internalDatasetId) {
      throw new Error(
        "Either datasetName or internalDatasetId must be provided"
      );
    }
    if (datasetName && internalDatasetId) {
      throw new Error(
        "Both datasetName and internalDatasetId cannot be provided"
      );
    }

    const dataset = internalDatasetId
      ? parseSchemaInternalId(internalDatasetId).name
      : datasetName;

    // Can't happen, to please TS.
    if (!dataset) {
      throw new Error("Dataset name is required");
    }

    // Get the dataset specified by the schema
    const d = await conn.dataset(dataset);
    const r = await d.getTables();
    const tables = r[0];
    return new Ok(
      removeNulls(
        tables.map((table) => {
          if (!table.id) {
            return null;
          }
          return {
            name: table.id,
            database_name: credentials.project_id,
            schema_name: dataset,
          };
        })
      )
    );
  } catch (error) {
    return new Err(error instanceof Error ? error : new Error(String(error)));
  }
};

// BigQuery is read-only as we force the readonly scope when creating the client.
export const isConnectionReadonly = () => new Ok(undefined);
