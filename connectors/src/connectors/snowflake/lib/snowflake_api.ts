import type { Result } from "@dust-tt/types";
import type { SnowflakeCredentials } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { Connection, RowStatement, SnowflakeError } from "snowflake-sdk";
import snowflake from "snowflake-sdk";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SnowflakeRow = Record<string, any>;
export type SnowflakeRows = Array<SnowflakeRow>;

/**
 * Test the connection to Snowflake with the provided credentials.
 * Used to check if the credentials are valid and the connection is successful.
 */
export const testConnection = async ({
  credentials,
}: {
  credentials: SnowflakeCredentials;
}): Promise<Result<string, Error>> => {
  const connection = snowflake.createConnection(credentials);

  try {
    const conn = await _connectToSnowflake(connection);
    // TODO(SNOWFLAKE): Improve checks: we want to make sure we have read and read-only access.
    const rows = await _executeQuery(conn, "SHOW TABLES");

    if (!rows || rows.length === 0) {
      throw new Error("No tables found or no access to any tables");
    }

    await _closeConnection(conn);
    return new Ok("Connection successful");
  } catch (error) {
    return new Err(error instanceof Error ? error : new Error(String(error)));
  }
};

/**
 * Fetch the tables available in the Snowflake account.
 */
export const fetchDatabases = async ({
  credentials,
}: {
  credentials: SnowflakeCredentials;
}): Promise<Result<SnowflakeRows, Error>> => {
  const query = "SHOW DATABASES";
  return _fetchRows({ credentials, query });
};

/**
 * Fetch the tables available in the Snowflake account.
 */
export const fetchSchemas = async ({
  credentials,
  fromDatabase,
}: {
  credentials: SnowflakeCredentials;
  fromDatabase?: string;
}): Promise<Result<SnowflakeRows, Error>> => {
  const query = fromDatabase
    ? `SHOW SCHEMAS IN DATABASE ${fromDatabase}`
    : "SHOW SCHEMAS";
  return _fetchRows({ credentials, query });
};

/**
 * Fetch the tables available in the Snowflake account.
 */
export const fetchTables = async ({
  credentials,
  fromSchema,
}: {
  credentials: SnowflakeCredentials;
  fromSchema?: string;
}): Promise<Result<SnowflakeRows, Error>> => {
  const query = fromSchema
    ? `SHOW TABLES IN SCHEMA ${fromSchema}`
    : "SHOW TABLES";

  return _fetchRows({ credentials, query });
};

// UTILS

async function _fetchRows({
  credentials,
  query,
}: {
  credentials: SnowflakeCredentials;
  query: string;
}): Promise<Result<SnowflakeRows, Error>> {
  snowflake.configure({
    // @ts-expect-error OFF is not in the types but it's a valid value.
    logLevel: "OFF",
  });

  const connection = snowflake.createConnection(credentials);

  try {
    const conn = await _connectToSnowflake(connection);
    const rows = await _executeQuery(conn, query);
    await _closeConnection(conn);

    if (!rows) {
      throw new Error("No tables found or no access to any table.");
    }

    return new Ok(rows);
  } catch (error) {
    return new Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Util: Connect to Snowflake.
 */
function _connectToSnowflake(
  connection: snowflake.Connection
): Promise<Connection> {
  return new Promise((resolve, reject) => {
    connection.connect((err: SnowflakeError | undefined, conn: Connection) => {
      if (err) {
        reject(err);
      } else {
        resolve(conn);
      }
    });
  });
}

/**
 * Util: Execute a query on the Snowflake connection.
 */
function _executeQuery(
  conn: Connection,
  sqlText: string
): Promise<SnowflakeRows | undefined> {
  return new Promise((resolve, reject) => {
    conn.execute({
      sqlText,
      complete: (
        err: SnowflakeError | undefined,
        stmt: RowStatement,
        rows: SnowflakeRows | undefined
      ) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      },
    });
  });
}

/**
 * Util: Close the Snowflake connection.
 */
function _closeConnection(conn: Connection): Promise<void> {
  return new Promise((resolve, reject) => {
    conn.destroy((err: SnowflakeError | undefined) => {
      if (err) {
        console.error("Error closing connection:", err);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}
