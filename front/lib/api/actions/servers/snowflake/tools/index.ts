import type { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolDefinition,
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { SnowflakeClient } from "@app/lib/api/actions/servers/snowflake/client";
import {
  MAX_QUERY_ROWS,
  SNOWFLAKE_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/snowflake/metadata";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

type SnowflakeToolKey = keyof typeof SNOWFLAKE_TOOLS_METADATA;

type SnowflakeToolHandlers = {
  [K in SnowflakeToolKey]: (
    params: z.infer<
      z.ZodObject<(typeof SNOWFLAKE_TOOLS_METADATA)[K]["schema"]>
    >,
    extra: ToolHandlerExtra
  ) => Promise<ToolHandlerResult>;
};

const CONNECTION_ERROR = new MCPError(
  "Snowflake connection not configured. Please connect your Snowflake account."
);

function getClientFromAuthInfo(
  authInfo:
    | {
        extra?: Record<string, unknown>;
        token?: string;
      }
    | null
    | undefined
): Result<SnowflakeClient, MCPError> {
  const account = authInfo?.extra?.snowflake_account;
  const warehouse = authInfo?.extra?.snowflake_warehouse;
  const token = authInfo?.token;

  if (typeof account !== "string" || typeof warehouse !== "string" || !token) {
    return new Err(CONNECTION_ERROR);
  }

  return new Ok(new SnowflakeClient(account, token, warehouse));
}

const handlers: SnowflakeToolHandlers = {
  list_databases: async (_params, extra) => {
    const clientRes = getClientFromAuthInfo(extra.authInfo);
    if (clientRes.isErr()) {
      return clientRes;
    }

    const result = await clientRes.value.listDatabases();
    if (result.isErr()) {
      return new Err(new MCPError(result.error.message));
    }

    const databases = result.value;
    return new Ok([
      {
        type: "text" as const,
        text: `Found ${databases.length} databases`,
      },
      {
        type: "text" as const,
        text: JSON.stringify({ databases }, null, 2),
      },
    ]);
  },

  list_schemas: async ({ database }, extra) => {
    const clientRes = getClientFromAuthInfo(extra.authInfo);
    if (clientRes.isErr()) {
      return clientRes;
    }

    const result = await clientRes.value.listSchemas(database);
    if (result.isErr()) {
      return new Err(new MCPError(result.error.message));
    }

    const schemas = result.value;
    return new Ok([
      {
        type: "text" as const,
        text: `Found ${schemas.length} schemas in database "${database}"`,
      },
      {
        type: "text" as const,
        text: JSON.stringify({ database, schemas }, null, 2),
      },
    ]);
  },

  list_tables: async ({ database, schema }, extra) => {
    const clientRes = getClientFromAuthInfo(extra.authInfo);
    if (clientRes.isErr()) {
      return clientRes;
    }

    const result = await clientRes.value.listTables(database, schema);
    if (result.isErr()) {
      return new Err(new MCPError(result.error.message));
    }

    const tables = result.value;
    return new Ok([
      {
        type: "text" as const,
        text: `Found ${tables.length} tables/views in "${database}"."${schema}"`,
      },
      {
        type: "text" as const,
        text: JSON.stringify({ database, schema, tables }, null, 2),
      },
    ]);
  },

  describe_table: async ({ database, schema, table }, extra) => {
    const clientRes = getClientFromAuthInfo(extra.authInfo);
    if (clientRes.isErr()) {
      return clientRes;
    }

    const result = await clientRes.value.describeTable(database, schema, table);
    if (result.isErr()) {
      return new Err(new MCPError(result.error.message));
    }

    const columns = result.value;
    return new Ok([
      {
        type: "text" as const,
        text: `Table "${database}"."${schema}"."${table}" has ${columns.length} columns`,
      },
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            database,
            schema,
            table,
            columns,
          },
          null,
          2
        ),
      },
    ]);
  },

  query: async ({ sql, database, schema, warehouse, max_rows }, extra) => {
    const clientRes = getClientFromAuthInfo(extra.authInfo);
    if (clientRes.isErr()) {
      return clientRes;
    }

    const result = await clientRes.value.readOnlyQuery(
      sql,
      database,
      schema,
      warehouse,
      max_rows ?? MAX_QUERY_ROWS
    );
    if (result.isErr()) {
      return new Err(new MCPError(result.error.message));
    }

    const { columns, rows, rowCount } = result.value;

    // Format output for LLM consumption
    const columnNames = columns.map((c) => c.name);
    const columnTypes = columns.map((c) => `${c.name}: ${c.type}`);

    return new Ok([
      {
        type: "text" as const,
        text: `Query returned ${rowCount} rows with columns: ${columnNames.join(", ")}`,
      },
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            columns: columnTypes,
            rowCount,
            data: rows,
          },
          null,
          2
        ),
      },
    ]);
  },
};

export const TOOLS = (
  Object.keys(SNOWFLAKE_TOOLS_METADATA) as SnowflakeToolKey[]
).map(
  (key) =>
    ({
      ...SNOWFLAKE_TOOLS_METADATA[key],
      handler: handlers[key],
    }) as unknown as ToolDefinition
);
