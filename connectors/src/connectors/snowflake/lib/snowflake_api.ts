import { createPrivateKey } from "node:crypto";

import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type {
  Connection,
  ConnectionOptions,
  RowStatement,
  SnowflakeError,
} from "snowflake-sdk";
import snowflake from "snowflake-sdk";

import type {
  RemoteDBDatabase,
  RemoteDBSchema,
  RemoteDBTable,
  RemoteDBTree,
} from "@connectors/lib/remote_databases/utils";
import {
  remoteDBDatabaseCodec,
  remoteDBSchemaCodec,
  remoteDBTableCodec,
} from "@connectors/lib/remote_databases/utils";
import logger from "@connectors/logger/logger";
import type { SnowflakeCredentials } from "@connectors/types";
import { EXCLUDE_DATABASES, EXCLUDE_SCHEMAS } from "@connectors/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SnowflakeRow = Record<string, any>;
type SnowflakeRows = Array<SnowflakeRow>;

class InvalidPrivateKeyError extends Error {
  // Keep original error context for logging and debugging
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cause?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(message: string, cause?: any) {
    super(message);
    this.name = "InvalidPrivateKeyError";
    this.cause = cause;
  }
}

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
  | "INVALID_ACCOUNT"
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
    const err = connectionRes.error;

    const msg = err.message ?? "Unknown error";

    if (
      msg.includes("Hostname/IP does not match certificate's altnames") ||
      msg.includes("ERR_TLS_CERT_ALTNAME_INVALID") ||
      msg.includes("Connection attempt timed out while contacting Snowflake") ||
      err.name === "NetworkError"
    ) {
      return new Err(
        new TestConnectionError(
          "INVALID_ACCOUNT",
          "Invalid account or region. Verify your Snowflake account and region settings."
        )
      );
    }

    if (err.name === "InvalidPrivateKeyError") {
      return new Err(
        new TestConnectionError(
          "INVALID_CREDENTIALS",
          "Invalid private key or passphrase. Provide a valid PEM private key and, if encrypted, the correct passphrase."
        )
      );
    }

    if (
      err.name === "OperationFailedError" ||
      msg.includes("JWT token is invalid")
    ) {
      return new Err(
        new TestConnectionError(
          "INVALID_CREDENTIALS",
          "Invalid credentials. Verify your Snowflake username and RSA public key configuration."
        )
      );
    }

    return new Err(new TestConnectionError("UNKNOWN", msg));
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
    logLevel: "OFF",
  });
  try {
    const connectionOptions: ConnectionOptions = {
      // Replace any `_` with `-` in the account name for nginx proxy.
      account: credentials.account.replace(/_/g, "-"),
      username: credentials.username,
      role: credentials.role,
      warehouse: credentials.warehouse,

      // Use proxy if defined to have all requests coming from the same IP.
      proxyHost: process.env.PROXY_HOST,
      proxyPort: process.env.PROXY_PORT
        ? parseInt(process.env.PROXY_PORT)
        : undefined,
      proxyUser: process.env.PROXY_USER_NAME,
      proxyPassword: process.env.PROXY_USER_PASSWORD,

      retryTimeout: process.env.SNOWFLAKE_RETRY_TIMEOUT
        ? parseInt(process.env.SNOWFLAKE_RETRY_TIMEOUT)
        : 15,
    };

    if ("password" in credentials) {
      // Legacy credentials or explicit password auth
      connectionOptions.password = credentials.password;
    } else if ("private_key" in credentials) {
      // Key-pair authentication
      connectionOptions.authenticator = "SNOWFLAKE_JWT";

      // Always parse the provided key with Node's crypto to ensure PKCS#8 PEM output.
      // This accepts:
      // - Unencrypted PKCS#8 (-----BEGIN PRIVATE KEY-----)
      // - Encrypted PKCS#8 (-----BEGIN ENCRYPTED PRIVATE KEY-----) with passphrase
      // - PKCS#1 RSA keys (-----BEGIN RSA PRIVATE KEY-----), encrypted or not
      try {
        const passphraseToUse =
          credentials.private_key_passphrase !== undefined
            ? credentials.private_key_passphrase
            : "";

        const privateKeyObject = createPrivateKey({
          key: credentials.private_key.trim(),
          format: "pem",
          passphrase: passphraseToUse,
        });

        // Export as unencrypted PKCS#8 PEM since snowflake-sdk only accepts that shape.
        connectionOptions.privateKey = privateKeyObject
          .export({
            format: "pem",
            type: "pkcs8",
          })
          .toString();
      } catch (err) {
        const detail =
          err instanceof Error && err.message
            ? ` Original error: ${err.message}`
            : "";
        const isEncrypted = /-----BEGIN ENCRYPTED PRIVATE KEY-----/.test(
          credentials.private_key
        );
        const missingPassphrase =
          credentials.private_key_passphrase === undefined;
        const hint =
          isEncrypted && missingPassphrase
            ? " Encrypted key detected but no passphrase was supplied. If your passphrase is intentionally empty, submit an empty passphrase."
            : "";
        return new Err(
          new InvalidPrivateKeyError(
            `Invalid private key or passphrase.${hint} Provide a valid PEM key (PKCS#8 or RSA) and, if encrypted, the correct passphrase.${detail}`,
            err
          )
        );
      }
    } else {
      throw new Error("Invalid credentials format");
    }

    const connection = await new Promise<Connection>((resolve, reject) => {
      const connectTimeoutMs = process.env.SNOWFLAKE_CONNECT_TIMEOUT_MS
        ? parseInt(process.env.SNOWFLAKE_CONNECT_TIMEOUT_MS)
        : 15000;

      const conn = snowflake.createConnection(connectionOptions);
      let settled = false;

      const timeout = setTimeout(
        () => {
          if (settled) {
            return;
          }
          settled = true;
          try {
            conn.destroy((err: SnowflakeError | undefined) => {
              if (err) {
                reject(err as unknown as Error);
                return;
              }
              reject(
                new Error(
                  "Connection attempt timed out while contacting Snowflake. This often indicates an invalid account or region hostname."
                )
              );
            });
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        },
        isNaN(connectTimeoutMs) ? 15000 : connectTimeoutMs
      );

      conn.connect((err: SnowflakeError | undefined, c: Connection) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        if (err) {
          reject(err);
        } else {
          resolve(c);
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
 * Fetch the tables available in the Snowflake account. `fromDatabase` is required because there is
 * no guarantee to get all schemas otherwise.
 */
export const fetchSchemas = async ({
  credentials,
  fromDatabase,
  connection,
}: {
  credentials: SnowflakeCredentials;
  fromDatabase: string;
  connection?: Connection;
}): Promise<Result<Array<RemoteDBSchema>, Error>> => {
  const query = `SHOW SCHEMAS IN DATABASE ${fromDatabase}`;
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
  fromDatabase,
  fromSchema,
  connection,
}: {
  credentials: SnowflakeCredentials;
  fromDatabase?: string;
  fromSchema?: string;
  connection?: Connection;
}): Promise<Result<Array<RemoteDBTable>, Error>> => {
  // We fetch the tables in the schema provided if defined, otherwise in the database provided if
  // defined, otherwise globally.
  const query = fromSchema
    ? `SHOW TABLES IN SCHEMA ${fromSchema}`
    : fromDatabase
      ? `SHOW TABLES IN DATABASE ${fromDatabase}`
      : "SHOW TABLES";

  return _fetchRows<RemoteDBTable>({
    credentials,
    query,
    codec: remoteDBTableCodec,
    connection,
  });
};

export const fetchTree = async (
  {
    credentials,
    connection,
  }: {
    credentials: SnowflakeCredentials;
    connection: Connection;
  },
  loggerArgs: { [key: string]: string | number }
): Promise<Result<RemoteDBTree, Error>> => {
  const localLogger = logger.child(loggerArgs);

  const databasesRes = await fetchDatabases({ credentials, connection });
  if (databasesRes.isErr()) {
    return databasesRes;
  }
  localLogger.info(
    {
      databasesCount: databasesRes.value.length,
    },
    "Found databases in Snowflake"
  );

  const databases = databasesRes.value.filter(
    (db) => !EXCLUDE_DATABASES.includes(db.name)
  );

  const allSchemas: RemoteDBSchema[] = [];
  const allTables: RemoteDBTable[] = [];

  for (const db of databases) {
    const schemasRes = await fetchSchemas({
      credentials,
      fromDatabase: db.name,
      connection,
    });
    if (schemasRes.isErr()) {
      return schemasRes;
    }
    allSchemas.push(...schemasRes.value);

    const tablesRes = await fetchTables({
      credentials,
      fromDatabase: db.name,
      connection,
    });
    if (tablesRes.isErr()) {
      return tablesRes;
    }
    allTables.push(...tablesRes.value);
  }

  const schemas = allSchemas.filter((s) => !EXCLUDE_SCHEMAS.includes(s.name));
  localLogger.info(
    {
      schemasCount: schemas.length,
    },
    "Found schemas in Snowflake"
  );

  const tables = allTables;
  localLogger.info(
    {
      tablesCount: tables.length,
    },
    "Found tables in Snowflake"
  );

  const tree = {
    databases: databases.map((db) => ({
      ...db,
      schemas: schemas
        .filter((s) => s.database_name === db.name)
        .map((schema) => ({
          ...schema,
          tables: tables.filter((t) => t.schema_name === schema.name),
        })),
    })),
  };

  return new Ok(tree);
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
  return _checkRoleGrants(credentials, connection, credentials.role, false);
}

async function _checkRoleGrants(
  credentials: SnowflakeCredentials,
  connection: Connection,
  roleName: string,
  isDbRole: boolean,
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
    query: `SHOW GRANTS TO ${isDbRole ? "DATABASE ROLE" : "ROLE"} ${roleName}`,
    codec: snowflakeGrantCodec,
    connection,
  });
  if (currentGrantsRes.isErr()) {
    return new Err(
      new TestConnectionError("UNKNOWN", currentGrantsRes.error.message)
    );
  }

  let futureGrantsRes: Result<Array<SnowflakeFutureGrant>, Error>;
  if (!isDbRole) {
    // Check future grants
    futureGrantsRes = await _fetchRows<SnowflakeFutureGrant>({
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
  } else {
    futureGrantsRes = new Ok([]);
  }

  // Validate all grants (current and future)
  for (const g of [...currentGrantsRes.value, ...futureGrantsRes.value]) {
    const grantOn = "granted_on" in g ? g.granted_on : g.grant_on;

    if (
      [
        "TABLE",
        "VIEW",
        "EXTERNAL_TABLE",
        "DYNAMIC_TABLE",
        "EVENT_TABLE",
        "STREAM",
        "MATERIALIZED_VIEW",
        "HYBRID_TABLE",
        "ICEBERG_TABLE",
        "STREAM",
      ].includes(grantOn)
    ) {
      if (!["SELECT", "REFERENCES"].includes(g.privilege)) {
        return new Err(
          new TestConnectionError(
            "NOT_READONLY",
            `Non-select or references grant found on ${grantOn} "${g.name}": privilege=${g.privilege} (connection must be read-only).`
          )
        );
      }
    } else if (grantOn === "WAREHOUSE") {
      if (!["USAGE", "READ", "MONITOR"].includes(g.privilege)) {
        return new Err(
          new TestConnectionError(
            "NOT_READONLY",
            `Non-usage, read, or monitor grant found on ${grantOn} "${g.name}": privilege=${g.privilege} (connection must be read-only).`
          )
        );
      }
    } else if (["SCHEMA", "DATABASE"].includes(grantOn)) {
      if (!["USAGE", "READ", "MONITOR"].includes(g.privilege)) {
        return new Err(
          new TestConnectionError(
            "NOT_READONLY",
            `Non-usage, read, or monitor grant found on ${grantOn} "${g.name}": privilege=${g.privilege} (connection must be read-only).`
          )
        );
      }
    } else if (
      [
        "FILE_FORMAT",
        "FUNCTION",
        "PROCEDURE",
        "STAGE",
        "SEQUENCE",
        "MODEL",
        "CORTEX_SEARCH_SERVICE",
      ].includes(grantOn)
    ) {
      if (!["USAGE", "READ"].includes(g.privilege)) {
        return new Err(
          new TestConnectionError(
            "NOT_READONLY",
            `Non-usage or read grant found on ${grantOn} "${g.name}": privilege=${g.privilege} (connection must be read-only).`
          )
        );
      }
    } else if (
      [
        "RESOURCE_MONITOR",
        "COMPUTE_POOL",
        "FAILOVER_GROUP",
        "REPLICATION_GROUP",
        "USER",
        "ALERT",
        "PIPE",
        "SERVICE",
        "TASK",
      ].includes(grantOn)
    ) {
      if (["MONITOR"].includes(g.privilege)) {
        continue;
      }
      return new Err(
        new TestConnectionError(
          "NOT_READONLY",
          `Non-monitor grant found on ${grantOn} "${g.name}": privilege=${g.privilege} (connection must be read-only).`
        )
      );
    } else if (["ROLE", "DATABASE_ROLE"].includes(grantOn)) {
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
        grantOn === "DATABASE_ROLE",
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
