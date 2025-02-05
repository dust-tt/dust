import type { Result } from "@dust-tt/types";
import type { SnowflakeCredentials } from "@dust-tt/types";
import { Err, EXCLUDE_DATABASES, EXCLUDE_SCHEMAS, Ok } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { Connection, RowStatement, SnowflakeError } from "snowflake-sdk";
import snowflake from "snowflake-sdk";

import type {
  RemoteDBDatabase,
  RemoteDBSchema,
  RemoteDBTable,
} from "@connectors/lib/remote_databases/utils";
import {
  remoteDBDatabaseCodec,
  remoteDBSchemaCodec,
  remoteDBTableCodec,
} from "@connectors/lib/remote_databases/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SnowflakeRow = Record<string, any>;
type SnowflakeRows = Array<SnowflakeRow>;

const snowflakeGrantCodec = t.type({
  privilege: t.string,
  granted_on: t.string,
  name: t.string,
});
type SnowflakeGrant = t.TypeOf<typeof snowflakeGrantCodec>;
const snowflakeFutureGrantCodec = t.type({
  privilege: t.string,
  grant_on: t.string,
  name: t.string,
});
type SnowflakeFutureGrant = t.TypeOf<typeof snowflakeFutureGrantCodec>;

type TestConnectionErrorCode =
  | "INVALID_CREDENTIALS"
  | "NOT_READONLY"
  | "NO_TABLES"
  | "UNKNOWN";

export class TestConnectionError extends Error {
  code: TestConnectionErrorCode;

  constructor(code: TestConnectionErrorCode, message: string) {
    super(message);
    this.name = "TestSnowflakeConnectionError";
    this.code = code;
  }
}

export function isTestConnectionError(
  error: Error
): error is TestConnectionError {
  return error.name === "TestSnowflakeConnectionError";
}

/**
 * Test the connection to Snowflake with the provided credentials.
 * Used to check if the credentials are valid and the connection is successful.
 */
export const testConnection = async ({
  credentials,
}: {
  credentials: SnowflakeCredentials;
}): Promise<Result<string, TestConnectionError>> => {
  // Connect to snowflake, fetch tables and grants, and close the connection.
  const connectionRes = await connectToSnowflake(credentials);
  if (connectionRes.isErr()) {
    if (connectionRes.error.name === "OperationFailedError") {
      return new Err(
        new TestConnectionError(
          "INVALID_CREDENTIALS",
          connectionRes.error.message
        )
      );
    }

    return new Err(
      new TestConnectionError("UNKNOWN", connectionRes.error.message)
    );
  }

  const connection = connectionRes.value;
  const tablesRes = await fetchTables({ credentials, connection });
  const grantsRes = await isConnectionReadonly({ credentials, connection });

  const closeConnectionRes = await _closeConnection(connection);
  if (closeConnectionRes.isErr()) {
    return new Err(
      new TestConnectionError("UNKNOWN", closeConnectionRes.error.message)
    );
  }

  if (grantsRes.isErr()) {
    return grantsRes;
  }
  if (tablesRes.isErr()) {
    return new Err(new TestConnectionError("UNKNOWN", tablesRes.error.message));
  }

  const tables = tablesRes.value.filter(
    (t) =>
      !EXCLUDE_DATABASES.includes(t.database_name) &&
      !EXCLUDE_SCHEMAS.includes(t.schema_name)
  );
  if (tables.length === 0) {
    return new Err(new TestConnectionError("NO_TABLES", "No tables found."));
  }

  return new Ok("Connection successful");
};

export async function connectToSnowflake(
  credentials: SnowflakeCredentials
): Promise<Result<Connection, Error>> {
  snowflake.configure({
    // @ts-expect-error OFF is not in the types but it's a valid value.
    logLevel: "OFF",
  });
  try {
    const connection = await new Promise<Connection>((resolve, reject) => {
      snowflake
        .createConnection({
          ...credentials,

          // Use proxy if defined to have all requests coming from the same IP.
          proxyHost: process.env.PROXY_HOST,
          proxyPort: process.env.PROXY_PORT
            ? parseInt(process.env.PROXY_PORT)
            : undefined,
          proxyUser: process.env.PROXY_USER_NAME,
          proxyPassword: process.env.PROXY_USER_PASSWORD,
        })
        .connect((err: SnowflakeError | undefined, conn: Connection) => {
          if (err) {
            reject(err);
          } else {
            resolve(conn);
          }
        });
    });

    return new Ok(connection);
  } catch (error) {
    return new Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Fetch the tables available in the Snowflake account.
 */
export const fetchDatabases = async ({
  credentials,
  connection,
}: {
  credentials: SnowflakeCredentials;
  connection?: Connection;
}): Promise<Result<Array<RemoteDBDatabase>, Error>> => {
  const query = "SHOW DATABASES";
  return _fetchRows<RemoteDBDatabase>({
    credentials,
    query,
    codec: remoteDBDatabaseCodec,
    connection,
  });
};

/**
 * Fetch the tables available in the Snowflake account.
 */
export const fetchSchemas = async ({
  credentials,
  fromDatabase,
  connection,
}: {
  credentials: SnowflakeCredentials;
  fromDatabase?: string;
  connection?: Connection;
}): Promise<Result<Array<RemoteDBSchema>, Error>> => {
  const query = fromDatabase
    ? `SHOW SCHEMAS IN DATABASE ${fromDatabase}`
    : "SHOW SCHEMAS";
  return _fetchRows<RemoteDBSchema>({
    credentials,
    query,
    codec: remoteDBSchemaCodec,
    connection,
  });
};

/**
 * Fetch the tables available in the Snowflake account.
 */
export const fetchTables = async ({
  credentials,
  fromSchema,
  connection,
}: {
  credentials: SnowflakeCredentials;
  fromSchema?: string;
  connection?: Connection;
}): Promise<Result<Array<RemoteDBTable>, Error>> => {
  const query = fromSchema
    ? `SHOW TABLES IN SCHEMA ${fromSchema}`
    : "SHOW TABLES";

  return _fetchRows<RemoteDBTable>({
    credentials,
    query,
    codec: remoteDBTableCodec,
    connection,
  });
};

/**
 * Fetch the grants available for the Snowflake role,
 * including future grants, then check if the connection is read-only.
 */

export async function isConnectionReadonly({
  credentials,
  connection,
}: {
  credentials: SnowflakeCredentials;
  connection: Connection;
}): Promise<Result<void, TestConnectionError>> {
  // Check current role and all inherited roles
  return _checkRoleGrants(credentials, connection, credentials.role);
}

async function _checkRoleGrants(
  credentials: SnowflakeCredentials,
  connection: Connection,
  roleName: string,
  checkedRoles: Set<string> = new Set()
): Promise<Result<void, TestConnectionError>> {
  // Prevent infinite recursion with cycles in role hierarchy
  if (checkedRoles.has(roleName)) {
    return new Ok(undefined);
  }
  checkedRoles.add(roleName);

  // Check current grants
  const currentGrantsRes = await _fetchRows<SnowflakeGrant>({
    credentials,
    query: `SHOW GRANTS TO ROLE ${roleName}`,
    codec: snowflakeGrantCodec,
    connection,
  });
  if (currentGrantsRes.isErr()) {
    return new Err(
      new TestConnectionError("UNKNOWN", currentGrantsRes.error.message)
    );
  }

  // Check future grants
  const futureGrantsRes = await _fetchRows<SnowflakeFutureGrant>({
    credentials,
    query: `SHOW FUTURE GRANTS TO ROLE ${roleName}`,
    codec: snowflakeFutureGrantCodec,
    connection,
  });
  if (futureGrantsRes.isErr()) {
    return new Err(
      new TestConnectionError("UNKNOWN", futureGrantsRes.error.message)
    );
  }

  // Validate all grants (current and future)
  for (const g of [...currentGrantsRes.value, ...futureGrantsRes.value]) {
    const grantOn = "granted_on" in g ? g.granted_on : g.grant_on;

    if (["TABLE", "VIEW"].includes(grantOn)) {
      if (g.privilege !== "SELECT") {
        return new Err(
          new TestConnectionError(
            "NOT_READONLY",
            `Non-select grant found on ${grantOn} "${g.name}": privilege=${g.privilege} (connection must be read-only).`
          )
        );
      }
    } else if (["SCHEMA", "DATABASE", "WAREHOUSE"].includes(grantOn)) {
      if (g.privilege !== "USAGE") {
        return new Err(
          new TestConnectionError(
            "NOT_READONLY",
            `Non-usage grant found on ${grantOn} "${g.name}": privilege=${g.privilege} (connection must be read-only).`
          )
        );
      }
    } else if (grantOn === "ROLE") {
      // For roles, allow USAGE (role inheritance) but recursively check the parent role
      if (g.privilege !== "USAGE") {
        return new Err(
          new TestConnectionError(
            "NOT_READONLY",
            `Non-usage grant found on ${grantOn} "${g.name}": privilege=${g.privilege} (connection must be read-only).`
          )
        );
      }
      // Recursively check parent role's grants
      const parentRoleCheck = await _checkRoleGrants(
        credentials,
        connection,
        g.name,
        checkedRoles
      );
      if (parentRoleCheck.isErr()) {
        return parentRoleCheck;
      }
    } else {
      // We don't allow any other grants
      return new Err(
        new TestConnectionError(
          "NOT_READONLY",
          `Unsupported grant found on ${grantOn} "${g.name}": privilege=${g.privilege} (connection must be read-only).`
        )
      );
    }
  }

  return new Ok(undefined);
}

// UTILS

async function _fetchRows<T>({
  credentials,
  query,
  codec,
  connection,
}: {
  credentials: SnowflakeCredentials;
  query: string;
  codec: t.Type<T>;
  connection?: Connection;
}): Promise<Result<Array<T>, Error>> {
  const connRes = await (() =>
    connection ? new Ok(connection) : connectToSnowflake(credentials))();
  if (connRes.isErr()) {
    return connRes;
  }
  const conn = connRes.value;

  const rowsRes = await _executeQuery(conn, query);
  if (rowsRes.isErr()) {
    return rowsRes;
  }
  const rows = rowsRes.value;

  // We close the connection if we created it.
  if (!connection) {
    await _closeConnection(conn);
  }

  if (!rows) {
    return new Err(new Error("No tables found or no access to any table."));
  }

  const parsedRows: Array<T> = [];
  for (const row of rows) {
    const decoded = codec.decode(row);
    if (isLeft(decoded)) {
      const pathError = reporter.formatValidationErrors(decoded.left);
      return new Err(new Error(`Could not parse row: ${pathError}`));
    }

    parsedRows.push(decoded.right);
  }

  return new Ok(parsedRows);
}

/**
 * Util: Close the Snowflake connection.
 */
async function _closeConnection(
  conn: Connection
): Promise<Result<void, Error>> {
  try {
    await new Promise<void>((resolve, reject) => {
      conn.destroy((err: SnowflakeError | undefined) => {
        if (err) {
          console.error("Error closing connection:", err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
    return new Ok(undefined);
  } catch (error) {
    return new Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Util: Execute a query on the Snowflake connection.
 */
async function _executeQuery(
  conn: Connection,
  sqlText: string
): Promise<Result<SnowflakeRows | undefined, Error>> {
  try {
    const r = await new Promise<SnowflakeRows | undefined>(
      (resolve, reject) => {
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
      }
    );
    return new Ok(r);
  } catch (error) {
    return new Err(error instanceof Error ? error : new Error(String(error)));
  }
}
