import type {
  Connection,
  ConnectionOptions,
  RowStatement,
  SnowflakeError,
} from "snowflake-sdk";
import snowflake from "snowflake-sdk";

import type { Result } from "@app/types";
import { EnvironmentConfig, Err, normalizeError, Ok } from "@app/types";

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

/**
 * Escape a Snowflake identifier for use in double-quoted SQL.
 * Doubles any internal double-quote characters to prevent SQL injection.
 */
function escapeIdentifier(identifier: string): string {
  return identifier.replace(/"/g, '""');
}

/**
 * Type guard for extracting string values from Snowflake row data.
 */
function isString(value: unknown): value is string {
  return typeof value === "string";
}

/**
 * Safely extract a string value from a row, with fallback.
 */
function getRowString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return isString(value) ? value : "";
}

/**
 * Safely extract a string value from a row, checking multiple keys (for case sensitivity).
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
  private accessToken: string;

  constructor(account: string, accessToken: string) {
    this.account = account.trim();
    this.accessToken = accessToken;
  }

  /**
   * Create a Snowflake connection using OAuth authentication.
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
        authenticator: "OAUTH",
        token: this.accessToken,

        // Use proxy if defined to have all requests coming from the same IP
        proxyHost: EnvironmentConfig.getEnvVariable("PROXY_HOST"),
        proxyPort: parseInt(
          EnvironmentConfig.getEnvVariable("PROXY_PORT") || "0"
        ),
        proxyUser: EnvironmentConfig.getEnvVariable("PROXY_USER_NAME"),
        proxyPassword: EnvironmentConfig.getEnvVariable("PROXY_USER_PASSWORD"),
      };

      const connection = await new Promise<Connection>((resolve, reject) => {
        const connectTimeoutMs = 15000;

        const conn = snowflake.createConnection(connectionOptions);
        let settled = false;

        const timeout = setTimeout(() => {
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

      return new Ok(connection);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  /**
   * Close a Snowflake connection.
   */
  private async closeConnection(conn: Connection): Promise<void> {
    return new Promise((resolve) => {
      conn.destroy((err: SnowflakeError | undefined) => {
        // We don't throw on close errors - just log and continue
        if (err) {
          // Silently ignore close errors
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      type SnowflakeRows = Record<string, any>[];

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
      // Convert rows to Record<string, unknown> for type safety
      const typedRows: Record<string, unknown>[] = rows.map((row) => {
        const typedRow: Record<string, unknown> = {};
        for (const key of Object.keys(row)) {
          typedRow[key] = row[key];
        }
        return typedRow;
      });

      return new Ok({
        columns: result.columns,
        rows: typedRows,
        rowCount: typedRows.length,
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
      const result = await this.executeQuery(conn, sql);
      return result;
    } finally {
      await this.closeConnection(conn);
    }
  }

  async listDatabases(): Promise<Result<string[], Error>> {
    const result = await this.executeStatement("SHOW DATABASES");
    if (result.isErr()) {
      return result;
    }

    const databases = result.value.rows.map((row) => getRowString(row, "name"));
    return new Ok(databases);
  }

  async listSchemas(database: string): Promise<Result<string[], Error>> {
    const result = await this.executeStatement(
      `SHOW SCHEMAS IN DATABASE "${escapeIdentifier(database)}"`
    );
    if (result.isErr()) {
      return result;
    }

    const schemas = result.value.rows.map((row) => getRowString(row, "name"));
    return new Ok(schemas);
  }

  async listTables(
    database: string,
    schema: string
  ): Promise<Result<Array<{ name: string; kind: string }>, Error>> {
    const result = await this.executeStatement(
      `SHOW TABLES IN "${escapeIdentifier(database)}"."${escapeIdentifier(schema)}"`
    );
    if (result.isErr()) {
      return result;
    }

    const tables = result.value.rows.map((row) => ({
      name: getRowString(row, "name"),
      kind: getRowString(row, "kind") || "TABLE",
    }));

    // Also get views (failure is non-fatal - some schemas may not have view permissions)
    const viewsResult = await this.executeStatement(
      `SHOW VIEWS IN "${escapeIdentifier(database)}"."${escapeIdentifier(schema)}"`
    );
    if (viewsResult.isOk()) {
      const views = viewsResult.value.rows.map((row) => ({
        name: getRowString(row, "name"),
        kind: "VIEW",
      }));
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
      `DESCRIBE TABLE "${escapeIdentifier(database)}"."${escapeIdentifier(schema)}"."${escapeIdentifier(table)}"`
    );
    if (result.isErr()) {
      return result;
    }

    const columns: SnowflakeColumn[] = result.value.rows.map((row) => ({
      name: getRowString(row, "name"),
      type: getRowString(row, "type"),
      nullable: getRowString(row, "null") === "Y",
    }));

    return new Ok(columns);
  }

  /**
   * Validate that a query is read-only using EXPLAIN.
   * This is the authoritative check - Snowflake's query planner tells us
   * exactly what operations will be performed.
   */
  private async validateReadOnlyWithExplain(
    conn: Connection,
    sql: string
  ): Promise<Result<void, Error>> {
    // Use EXPLAIN USING TABULAR to get the query plan as structured data.
    // The result includes an 'operation' column with values like
    // 'Insert', 'Update', 'Delete', 'Merge' for write operations.
    const explainSql = `EXPLAIN USING TABULAR ${sql}`;

    const result = await this.executeQuery(conn, explainSql);

    if (result.isErr()) {
      // If EXPLAIN fails, the query is likely invalid anyway
      return new Err(
        new Error(`Failed to validate query: ${result.error.message}`)
      );
    }

    // Check the 'operation' column in each row for write operations.
    // Snowflake returns column names in uppercase, so we need case-insensitive lookup.
    const writeOperations = ["INSERT", "UPDATE", "DELETE", "MERGE"];

    for (const row of result.value.rows) {
      // Try both uppercase (Snowflake default) and lowercase column names
      const operation = getRowStringMultiKey(row, "operation", "OPERATION");
      if (operation && writeOperations.includes(operation.toUpperCase())) {
        return new Err(
          new Error(
            `Write operations are not allowed: ${operation} operation detected`
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
    // Primary security is via Snowflake role permissions.
    // This EXPLAIN-based validation provides defense-in-depth.

    const trimmedSql = sql.trim().toUpperCase();

    // Only allow SELECT/WITH queries - use dedicated tools for SHOW/DESCRIBE
    if (!trimmedSql.startsWith("SELECT") && !trimmedSql.startsWith("WITH")) {
      return new Err(
        new Error("Only SELECT and WITH queries are allowed in this tool")
      );
    }

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
          `USE DATABASE "${escapeIdentifier(database)}"`
        );
        if (useDbResult.isErr()) {
          return useDbResult;
        }
      }
      if (schema) {
        const useSchemaResult = await this.executeQuery(
          conn,
          `USE SCHEMA "${escapeIdentifier(schema)}"`
        );
        if (useSchemaResult.isErr()) {
          return useSchemaResult;
        }
      }
      if (warehouse) {
        const useWhResult = await this.executeQuery(
          conn,
          `USE WAREHOUSE "${escapeIdentifier(warehouse)}"`
        );
        if (useWhResult.isErr()) {
          return useWhResult;
        }
      }

      // Use EXPLAIN to validate the query is truly read-only
      // (catches WITH...INSERT and other bypass attempts)
      const validationResult = await this.validateReadOnlyWithExplain(
        conn,
        sql
      );

      if (validationResult.isErr()) {
        return new Err(validationResult.error);
      }

      // Wrap query to enforce row limit
      const wrappedSql = `SELECT * FROM (${sql.trim()}) AS _limited_query LIMIT ${maxRows}`;

      return this.executeQuery(conn, wrappedSql);
    } finally {
      await this.closeConnection(conn);
    }
  }
}
