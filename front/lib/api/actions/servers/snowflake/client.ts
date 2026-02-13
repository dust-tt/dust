import { createPrivateKey } from "node:crypto";

import type {
  Connection,
  ConnectionOptions,
  RowStatement,
  SnowflakeError,
} from "snowflake-sdk";
import snowflake from "snowflake-sdk";

import { escapeSnowflakeIdentifier } from "@app/lib/utils/snowflake";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { EnvironmentConfig } from "@app/types/shared/utils/config";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";

// Maximum duration (in seconds) a query is allowed to run before being cancelled.
const QUERY_TIMEOUT_SECONDS = 120;

interface SnowflakeColumn {
  name: string;
  type: string;
  nullable: boolean;
}

interface SnowflakeQueryResult {
  columns: SnowflakeColumn[];
  rows: Record<string, unknown>[];
  rowCount: number;
}

type SnowflakeClientAuth =
  | {
      type: "oauth";
      token: string;
    }
  | {
      type: "keypair";
      username: string;
      role: string;
      privateKey: string;
      privateKeyPassphrase?: string;
    };

/**
 * Parse an optional string to an integer, returning undefined if not set or invalid.
 */
function parseOptionalInt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Safely extract a string value from a row, checking multiple keys (for case sensitivity).
 * Snowflake SDK may return column names in uppercase or lowercase depending on context.
 */
function getRowStringMultiKey(
  row: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (isString(value)) {
      return value;
    }
  }
  return undefined;
}

export class SnowflakeClient {
  private account: string;
  private warehouse: string;
  private auth: SnowflakeClientAuth;

  constructor(account: string, auth: SnowflakeClientAuth, warehouse: string) {
    this.account = account.trim();
    this.warehouse = warehouse.trim();
    this.auth = auth;
  }

  /**
   * Create a Snowflake connection using OAuth or key-pair authentication.
   * Uses proxy for static IP whitelisting support.
   */
  private async connect(): Promise<Result<Connection, Error>> {
    // Configure SDK to suppress verbose logging
    snowflake.configure({
      logLevel: "OFF",
    });

    try {
      const connectionOptions: ConnectionOptions = {
        // Replace any `_` with `-` in the account name for nginx proxy
        account: this.account.replace(/_/g, "-"),
        warehouse: this.warehouse,

        // Use proxy if defined to have all requests coming from the same IP.
        proxyHost: EnvironmentConfig.getOptionalEnvVariable("PROXY_HOST"),
        proxyPort: parseOptionalInt(
          EnvironmentConfig.getOptionalEnvVariable("PROXY_PORT")
        ),
        proxyUser: EnvironmentConfig.getOptionalEnvVariable("PROXY_USER_NAME"),
        proxyPassword: EnvironmentConfig.getOptionalEnvVariable(
          "PROXY_USER_PASSWORD"
        ),
      };

      if (this.auth.type === "oauth") {
        connectionOptions.authenticator = "OAUTH";
        connectionOptions.token = this.auth.token;
      } else if (this.auth.type === "keypair") {
        connectionOptions.authenticator = "SNOWFLAKE_JWT";
        connectionOptions.username = this.auth.username;
        connectionOptions.role = this.auth.role;
        connectionOptions.privateKey = exportSnowflakePrivateKey({
          privateKey: this.auth.privateKey,
          privateKeyPassphrase: this.auth.privateKeyPassphrase,
        });
      }

      const connection = await new Promise<Connection>((resolve, reject) => {
        const connectTimeoutMs = 15000;

        const conn = snowflake.createConnection(connectionOptions);
        let settled = false;

        const timeout = setTimeout(() => {
          if (settled) {
            return;
          }
          settled = true;

          // Reject immediately on timeout. `conn.destroy()` can hang in some network/DNS failure
          // modes, so only attempt it as best-effort cleanup.
          reject(
            new Error(
              "Connection attempt timed out while contacting Snowflake. This often indicates an invalid account or region hostname."
            )
          );

          try {
            conn.destroy((err: SnowflakeError | undefined) => {
              if (err) {
                logger.warn(
                  { error: err },
                  "Error destroying Snowflake connection after timeout"
                );
              }
            });
          } catch (e) {
            logger.warn(
              { error: e },
              "Exception destroying Snowflake connection after timeout"
            );
          }
        }, connectTimeoutMs);

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

      // Explicitly set the warehouse - the connectionOptions.warehouse isn't always respected
      try {
        await this.runSql(
          connection,
          `USE WAREHOUSE "${escapeSnowflakeIdentifier(this.warehouse)}"`
        );
      } catch (error) {
        // Clean up connection on USE WAREHOUSE failure
        await this.closeConnection(connection);
        return new Err(normalizeError(error));
      }

      // Set query timeout to 2 minutes.
      try {
        await this.runSql(
          connection,
          `ALTER SESSION SET STATEMENT_TIMEOUT_IN_SECONDS = ${QUERY_TIMEOUT_SECONDS}`
        );
      } catch (error) {
        await this.closeConnection(connection);
        return new Err(normalizeError(error));
      }

      return new Ok(connection);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  /**
   * Run a SQL statement on a connection (no result returned).
   */
  private async runSql(connection: Connection, sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      connection.execute({
        sqlText: sql,
        complete: (err: SnowflakeError | undefined) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        },
      });
    });
  }

  /**
   * Close a Snowflake connection.
   */
  private async closeConnection(conn: Connection): Promise<void> {
    return new Promise((resolve) => {
      conn.destroy((err: SnowflakeError | undefined) => {
        if (err) {
          logger.warn({ err }, "Snowflake connection close error");
        }
        resolve();
      });
    });
  }

  /**
   * Execute a SQL query on a connection and return the result.
   */
  private async executeQuery(
    conn: Connection,
    sql: string
  ): Promise<Result<SnowflakeQueryResult, Error>> {
    try {
      type SnowflakeRows = Record<string, unknown>[];

      const result = await new Promise<{
        rows: SnowflakeRows | undefined;
        columns: SnowflakeColumn[];
      }>((resolve, reject) => {
        conn.execute({
          sqlText: sql,
          complete: (
            err: SnowflakeError | undefined,
            stmt: RowStatement,
            rows: SnowflakeRows | undefined
          ) => {
            if (err) {
              reject(err);
            } else {
              // Extract column metadata from statement
              const cols = stmt.getColumns() ?? [];
              const columns: SnowflakeColumn[] = cols.map((col) => ({
                name: col.getName(),
                type: col.getType(),
                nullable: col.isNullable(),
              }));
              resolve({ rows, columns });
            }
          },
        });
      });

      const rows = result.rows ?? [];

      return new Ok({
        columns: result.columns,
        rows,
        rowCount: rows.length,
      });
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  /**
   * Execute a statement with connection management.
   */
  private async executeStatement(
    sql: string
  ): Promise<Result<SnowflakeQueryResult, Error>> {
    const connRes = await this.connect();
    if (connRes.isErr()) {
      return connRes;
    }
    const conn = connRes.value;

    try {
      return await this.executeQuery(conn, sql);
    } finally {
      await this.closeConnection(conn);
    }
  }

  async listDatabases(): Promise<Result<string[], Error>> {
    const result = await this.executeStatement("SHOW DATABASES");
    if (result.isErr()) {
      return result;
    }

    const databases = result.value.rows
      .map((row) => getRowStringMultiKey(row, "name", "NAME"))
      .filter((name): name is string => name !== undefined);
    return new Ok(databases);
  }

  async listSchemas(database: string): Promise<Result<string[], Error>> {
    const result = await this.executeStatement(
      `SHOW SCHEMAS IN DATABASE "${escapeSnowflakeIdentifier(database)}"`
    );
    if (result.isErr()) {
      return result;
    }

    const schemas = result.value.rows
      .map((row) => getRowStringMultiKey(row, "name", "NAME"))
      .filter((name): name is string => name !== undefined);
    return new Ok(schemas);
  }

  async listTables(
    database: string,
    schema: string
  ): Promise<Result<Array<{ name: string; kind: string }>, Error>> {
    const result = await this.executeStatement(
      `SHOW TABLES IN SCHEMA "${escapeSnowflakeIdentifier(database)}"."${escapeSnowflakeIdentifier(schema)}"`
    );
    if (result.isErr()) {
      return result;
    }

    const tables = result.value.rows
      .map((row) => {
        const name = getRowStringMultiKey(row, "name", "NAME");
        if (!name) {
          return null;
        }
        return {
          name,
          kind: getRowStringMultiKey(row, "kind", "KIND") ?? "TABLE",
        };
      })
      .filter((t): t is { name: string; kind: string } => t !== null);

    // Also get views (failure is non-fatal - some schemas may not have view permissions)
    const viewsResult = await this.executeStatement(
      `SHOW VIEWS IN SCHEMA "${escapeSnowflakeIdentifier(database)}"."${escapeSnowflakeIdentifier(schema)}"`
    );
    if (viewsResult.isOk()) {
      const views = viewsResult.value.rows
        .map((row) => {
          const name = getRowStringMultiKey(row, "name", "NAME");
          if (!name) {
            return null;
          }
          return { name, kind: "VIEW" };
        })
        .filter((v): v is { name: string; kind: string } => v !== null);
      tables.push(...views);
    }

    return new Ok(tables);
  }

  async describeTable(
    database: string,
    schema: string,
    table: string
  ): Promise<Result<SnowflakeColumn[], Error>> {
    const result = await this.executeStatement(
      `DESCRIBE TABLE "${escapeSnowflakeIdentifier(database)}"."${escapeSnowflakeIdentifier(schema)}"."${escapeSnowflakeIdentifier(table)}"`
    );
    if (result.isErr()) {
      return result;
    }

    const columns: SnowflakeColumn[] = result.value.rows.map((row) => ({
      name: getRowStringMultiKey(row, "name", "NAME") ?? "",
      type: getRowStringMultiKey(row, "type", "TYPE") ?? "",
      // Snowflake DESCRIBE TABLE returns "null?" column (with question mark)
      nullable:
        getRowStringMultiKey(row, "null?", "NULL?", "null", "NULL") === "Y",
    }));

    return new Ok(columns);
  }

  /**
   * Validate that a query is read-only using EXPLAIN.
   *
   * Uses a blocklist approach to reject known write operations, which is more
   * robust than checking if the query starts with SELECT (easily bypassed with comments).
   * EXPLAIN analyzes what the query actually does, not what it looks like.
   */
  private async validateReadOnlyWithExplain(
    conn: Connection,
    sql: string
  ): Promise<Result<void, Error>> {
    // Use EXPLAIN USING TABULAR to get the query plan as structured data.
    const explainSql = `EXPLAIN USING TABULAR ${sql}`;

    const result = await this.executeQuery(conn, explainSql);

    if (result.isErr()) {
      // If EXPLAIN fails, the query is likely invalid anyway
      return new Err(
        new Error(`Failed to validate query: ${result.error.message}`)
      );
    }

    // Blocklist of write operations that appear in Snowflake EXPLAIN output.
    // Based on Snowflake's GET_QUERY_OPERATOR_STATS documentation, these are
    // the DML operators that modify data:
    // - Insert: covers INSERT and COPY INTO table
    // - Update: UPDATE statements
    // - Delete: DELETE statements
    // - Merge: MERGE statements
    // - Copy: COPY INTO stage (data export/unload)
    // DDL commands (CREATE, DROP, ALTER, etc.) don't produce query plans.
    const blockedOperations = new Set([
      "INSERT",
      "UPDATE",
      "DELETE",
      "MERGE",
      "COPY",
    ]);

    for (const row of result.value.rows) {
      const operation = getRowStringMultiKey(row, "operation", "OPERATION");
      if (operation && blockedOperations.has(operation.toUpperCase())) {
        return new Err(
          new Error(
            `Write operation detected: ${operation}. Only SELECT queries are permitted.`
          )
        );
      }
    }

    return new Ok(undefined);
  }

  async readOnlyQuery(
    sql: string,
    database?: string,
    schema?: string,
    warehouse?: string,
    maxRows: number = 1000
  ): Promise<Result<SnowflakeQueryResult, Error>> {
    // Strip trailing semicolons before wrapping. Multi-statement injection is
    // already prevented by the SDK (MULTI_STATEMENT_COUNT defaults to 1) and by
    // the EXPLAIN/LIMIT wrappers which would produce invalid SQL with embedded semicolons.
    const sanitizedSql = sql.replace(/;\s*$/, "");

    const connRes = await this.connect();
    if (connRes.isErr()) {
      return connRes;
    }
    const conn = connRes.value;

    try {
      // Set context if provided
      if (database) {
        const useDbResult = await this.executeQuery(
          conn,
          `USE DATABASE "${escapeSnowflakeIdentifier(database)}"`
        );
        if (useDbResult.isErr()) {
          return useDbResult;
        }
      }
      if (schema) {
        const useSchemaResult = await this.executeQuery(
          conn,
          `USE SCHEMA "${escapeSnowflakeIdentifier(schema)}"`
        );
        if (useSchemaResult.isErr()) {
          return useSchemaResult;
        }
      }
      if (warehouse) {
        const useWhResult = await this.executeQuery(
          conn,
          `USE WAREHOUSE "${escapeSnowflakeIdentifier(warehouse)}"`
        );
        if (useWhResult.isErr()) {
          return useWhResult;
        }
      }

      // Validate query is read-only using EXPLAIN-based blocklist.
      // This checks what the query actually does, not what it looks like.
      const validationResult = await this.validateReadOnlyWithExplain(
        conn,
        sanitizedSql
      );

      if (validationResult.isErr()) {
        return validationResult;
      }

      // Wrap query to enforce row limit
      const wrappedSql = `SELECT * FROM (${sanitizedSql.trim()}) AS _limited_query LIMIT ${maxRows}`;

      return await this.executeQuery(conn, wrappedSql);
    } finally {
      await this.closeConnection(conn);
    }
  }
}

function exportSnowflakePrivateKey({
  privateKey,
  privateKeyPassphrase,
}: {
  privateKey: string;
  privateKeyPassphrase?: string;
}): string {
  const passphraseToUse = privateKeyPassphrase ?? "";

  const privateKeyObject = createPrivateKey({
    key: privateKey.trim(),
    format: "pem",
    passphrase: passphraseToUse,
  });

  // Export as unencrypted PKCS#8 PEM since snowflake-sdk only accepts that shape.
  return privateKeyObject
    .export({
      format: "pem",
      type: "pkcs8",
    })
    .toString();
}
