import type {
  RequestInfo as UndiciRequestInfo,
  RequestInit as UndiciRequestInit,
  Response as UndiciResponse,
} from "undici";
import { fetch as undiciFetch, ProxyAgent } from "undici";

import type { Result } from "@app/types";
import { EnvironmentConfig, Err, normalizeError, Ok } from "@app/types";

// Snowflake SQL API response types
interface SnowflakeStatementResponse {
  resultSetMetaData: {
    numRows: number;
    format: string;
    partitionInfo: Array<{ rowCount: number }>;
    rowType: Array<{
      name: string;
      database: string;
      schema: string;
      table: string;
      type: string;
      nullable: boolean;
      precision?: number;
      scale?: number;
      length?: number;
    }>;
  };
  data: string[][];
  code: string;
  statementHandle: string;
  statementStatusUrl: string;
  sqlState: string;
  message: string;
}

interface SnowflakeErrorResponse {
  code: string;
  message: string;
  sqlState?: string;
}

export interface SnowflakeColumn {
  name: string;
  type: string;
  nullable: boolean;
  database?: string;
  schema?: string;
  table?: string;
}

export interface SnowflakeQueryResult {
  columns: SnowflakeColumn[];
  rows: Record<string, unknown>[];
  rowCount: number;
}

type FetchFn = (
  url: UndiciRequestInfo,
  init?: UndiciRequestInit
) => Promise<UndiciResponse>;

// Always use static IP proxy for Snowflake since URLs are always *.snowflakecomputing.com
// This allows customers to whitelist our static IP in their Snowflake network policies
function createSnowflakeFetch(): FetchFn {
  const proxyUrl = `http://${EnvironmentConfig.getEnvVariable(
    "PROXY_USER_NAME"
  )}:${EnvironmentConfig.getEnvVariable(
    "PROXY_USER_PASSWORD"
  )}@${EnvironmentConfig.getEnvVariable(
    "PROXY_HOST"
  )}:${EnvironmentConfig.getEnvVariable("PROXY_PORT")}`;

  return (url: UndiciRequestInfo, options?: UndiciRequestInit) =>
    undiciFetch(url, {
      ...options,
      dispatcher: new ProxyAgent(proxyUrl),
    });
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
  private fetch: FetchFn;

  constructor(account: string, accessToken: string) {
    this.account = account.trim();
    this.accessToken = accessToken;
    this.fetch = createSnowflakeFetch();
  }

  private get baseUrl(): string {
    return `https://${this.account}.snowflakecomputing.com`;
  }

  private async executeStatement(
    sql: string,
    database?: string,
    schema?: string,
    warehouse?: string
  ): Promise<Result<SnowflakeQueryResult, Error>> {
    const url = `${this.baseUrl}/api/v2/statements`;

    const body: Record<string, unknown> = {
      statement: sql,
      timeout: 60,
      resultSetMetaData: {
        format: "jsonv2",
      },
    };

    if (database) {
      body.database = database;
    }
    if (schema) {
      body.schema = schema;
    }
    if (warehouse) {
      body.warehouse = warehouse;
    }

    try {
      const response = await this.fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.accessToken}`,
          Accept: "application/json",
          "X-Snowflake-Authorization-Token-Type": "OAUTH",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as SnowflakeErrorResponse;
        return new Err(
          new Error(
            `Snowflake API error (${response.status}): ${errorBody.message || response.statusText}`
          )
        );
      }

      const data = (await response.json()) as SnowflakeStatementResponse;

      // Transform the response into a more usable format
      const columns: SnowflakeColumn[] = data.resultSetMetaData.rowType.map(
        (col) => ({
          name: col.name,
          type: col.type,
          nullable: col.nullable,
          database: col.database,
          schema: col.schema,
          table: col.table,
        })
      );

      const rows = data.data.map((row) => {
        const rowObj: Record<string, unknown> = {};
        columns.forEach((col, idx) => {
          rowObj[col.name] = row[idx];
        });
        return rowObj;
      });

      return new Ok({
        columns,
        rows,
        rowCount: data.resultSetMetaData.numRows,
      });
    } catch (e) {
      return new Err(
        new Error(
          `Failed to execute Snowflake query: ${normalizeError(e).message}`
        )
      );
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
    sql: string,
    database?: string,
    schema?: string,
    warehouse?: string
  ): Promise<Result<void, Error>> {
    // Use EXPLAIN USING TABULAR to get the query plan as structured data.
    // The result includes an 'operation' column with values like
    // 'Insert', 'Update', 'Delete', 'Merge' for write operations.
    const explainSql = `EXPLAIN USING TABULAR ${sql}`;

    const result = await this.executeStatement(
      explainSql,
      database,
      schema,
      warehouse
    );

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

  async query(
    sql: string,
    database?: string,
    schema?: string,
    warehouse?: string,
    maxRows: number = 1000
  ): Promise<Result<SnowflakeQueryResult, Error>> {
    // Primary security is via Snowflake role permissions.
    // This EXPLAIN-based validation provides defense-in-depth.

    const trimmedSql = sql.trim().toUpperCase();

    // SHOW/DESCRIBE are inherently read-only, allow them directly
    if (
      trimmedSql.startsWith("SHOW") ||
      trimmedSql.startsWith("DESCRIBE") ||
      trimmedSql.startsWith("DESC")
    ) {
      return this.executeStatement(sql, database, schema, warehouse);
    }

    // For SELECT/WITH queries, use EXPLAIN to validate they're read-only
    // (catches WITH...INSERT and other bypass attempts)
    if (trimmedSql.startsWith("SELECT") || trimmedSql.startsWith("WITH")) {
      const validationResult = await this.validateReadOnlyWithExplain(
        sql,
        database,
        schema,
        warehouse
      );

      if (validationResult.isErr()) {
        return new Err(validationResult.error);
      }

      // Wrap query to enforce row limit. This handles all cases:
      // - SELECT without LIMIT
      // - SELECT with LIMIT > maxRows
      // - WITH queries (which may or may not have LIMIT)
      const wrappedSql = `SELECT * FROM (${sql.trim()}) AS _limited_query LIMIT ${maxRows}`;

      return this.executeStatement(wrappedSql, database, schema, warehouse);
    }

    // Reject anything else
    return new Err(
      new Error(
        "Only read-only queries are allowed (SELECT, SHOW, DESCRIBE, WITH)"
      )
    );
  }
}
