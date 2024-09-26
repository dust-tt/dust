import type { Result } from "@dust-tt/types";
import type { SnowflakeCredentials } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { Connection, RowStatement, SnowflakeError } from "snowflake-sdk";
import snowflake from "snowflake-sdk";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SnowflakeRows = Array<any> | undefined;

export const testConnection = async ({
  credentials,
}: {
  credentials: SnowflakeCredentials;
}): Promise<Result<string, Error>> => {
  const connection = snowflake.createConnection(credentials);

  try {
    const conn = await connectToSnowflake(connection);
    // TODO(SNOWFLAKE): Improve checks: we want to make sure we have read and read-only access.
    const rows = await executeQuery(conn, "SHOW DATABASES");

    if (!rows || rows.length === 0) {
      throw new Error("No databases found or no access to any database");
    }

    await closeConnection(conn);
    return new Ok("Connection successful");
  } catch (error) {
    return new Err(error instanceof Error ? error : new Error(String(error)));
  }
};

function connectToSnowflake(
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

function executeQuery(
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

function closeConnection(conn: Connection): Promise<void> {
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
