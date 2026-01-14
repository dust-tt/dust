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
        new Error(`Failed to execute Snowflake query: ${normalizeError(e).message}`)
      );
    }
  }

  async listDatabases(): Promise<Result<string[], Error>> {
    const result = await this.executeStatement("SHOW DATABASES");
    if (result.isErr()) {
      return result;
    }

    const databases = result.value.rows.map(
      (row) => row.name as string
    );
    return new Ok(databases);
  }

  async listSchemas(database: string): Promise<Result<string[], Error>> {
    const result = await this.executeStatement(
      `SHOW SCHEMAS IN DATABASE "${database}"`
    );
    if (result.isErr()) {
      return result;
    }

    const schemas = result.value.rows.map((row) => row.name as string);
    return new Ok(schemas);
  }

  async listTables(
    database: string,
    schema: string
  ): Promise<Result<Array<{ name: string; kind: string }>, Error>> {
    const result = await this.executeStatement(
      `SHOW TABLES IN "${database}"."${schema}"`
    );
    if (result.isErr()) {
      return result;
    }

    const tables = result.value.rows.map((row) => ({
      name: row.name as string,
      kind: (row.kind as string) || "TABLE",
    }));

    // Also get views
    const viewsResult = await this.executeStatement(
      `SHOW VIEWS IN "${database}"."${schema}"`
    );
    if (viewsResult.isOk()) {
      const views = viewsResult.value.rows.map((row) => ({
        name: row.name as string,
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
      `DESCRIBE TABLE "${database}"."${schema}"."${table}"`
    );
    if (result.isErr()) {
      return result;
    }

    const columns: SnowflakeColumn[] = result.value.rows.map((row) => ({
      name: row.name as string,
      type: row.type as string,
      nullable: (row.null as string) === "Y",
    }));

    return new Ok(columns);
  }

  async query(
    sql: string,
    database?: string,
    schema?: string,
    warehouse?: string,
    maxRows: number = 1000
  ): Promise<Result<SnowflakeQueryResult, Error>> {
    // Validate that the query is read-only (SELECT only)
    const trimmedSql = sql.trim().toUpperCase();
    const allowedPrefixes = ["SELECT", "SHOW", "DESCRIBE", "DESC", "WITH"];
    const isReadOnly = allowedPrefixes.some((prefix) =>
      trimmedSql.startsWith(prefix)
    );

    if (!isReadOnly) {
      return new Err(
        new Error(
          "Only read-only queries are allowed (SELECT, SHOW, DESCRIBE, WITH)"
        )
      );
    }

    // Add LIMIT if not already present for SELECT queries
    let finalSql = sql;
    if (
      trimmedSql.startsWith("SELECT") &&
      !trimmedSql.includes("LIMIT")
    ) {
      finalSql = `${sql.trim()} LIMIT ${maxRows}`;
    }

    return this.executeStatement(finalSql, database, schema, warehouse);
  }
}
