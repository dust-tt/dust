import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { SnowflakeClient } from "@app/lib/actions/mcp_internal_actions/servers/snowflake/client";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types";

const MAX_QUERY_ROWS = 1000;

function createSnowflakeClient(
  account: string | undefined,
  accessToken: string | undefined
): SnowflakeClient | null {
  if (!account || !accessToken) {
    return null;
  }
  return new SnowflakeClient(account, accessToken);
}

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("snowflake");

  server.tool(
    "list_databases",
    "List all databases accessible to the authenticated Snowflake user.",
    {},
    withToolLogging(
      auth,
      { toolNameForMonitoring: "snowflake", agentLoopContext },
      async (_params, { authInfo }) => {
        const client = createSnowflakeClient(
          authInfo?.extra?.snowflake_account as string | undefined,
          authInfo?.token
        );

        if (!client) {
          return new Err(
            new MCPError(
              "Snowflake connection not configured. Please connect your Snowflake account."
            )
          );
        }

        const result = await client.listDatabases();
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
      }
    )
  );

  server.tool(
    "list_schemas",
    "List all schemas within a specified Snowflake database.",
    {
      database: z.string().describe("The name of the database to list schemas from."),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "snowflake", agentLoopContext },
      async ({ database }, { authInfo }) => {
        const client = createSnowflakeClient(
          authInfo?.extra?.snowflake_account as string | undefined,
          authInfo?.token
        );

        if (!client) {
          return new Err(
            new MCPError(
              "Snowflake connection not configured. Please connect your Snowflake account."
            )
          );
        }

        const result = await client.listSchemas(database);
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
      }
    )
  );

  server.tool(
    "list_tables",
    "List all tables and views within a specified Snowflake schema.",
    {
      database: z.string().describe("The name of the database."),
      schema: z.string().describe("The name of the schema to list tables from."),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "snowflake", agentLoopContext },
      async ({ database, schema }, { authInfo }) => {
        const client = createSnowflakeClient(
          authInfo?.extra?.snowflake_account as string | undefined,
          authInfo?.token
        );

        if (!client) {
          return new Err(
            new MCPError(
              "Snowflake connection not configured. Please connect your Snowflake account."
            )
          );
        }

        const result = await client.listTables(database, schema);
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
      }
    )
  );

  server.tool(
    "describe_table",
    "Get the schema (column names, types, and constraints) of a Snowflake table.",
    {
      database: z.string().describe("The name of the database."),
      schema: z.string().describe("The name of the schema."),
      table: z.string().describe("The name of the table to describe."),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "snowflake", agentLoopContext },
      async ({ database, schema, table }, { authInfo }) => {
        const client = createSnowflakeClient(
          authInfo?.extra?.snowflake_account as string | undefined,
          authInfo?.token
        );

        if (!client) {
          return new Err(
            new MCPError(
              "Snowflake connection not configured. Please connect your Snowflake account."
            )
          );
        }

        const result = await client.describeTable(database, schema, table);
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
      }
    )
  );

  server.tool(
    "query",
    "Execute a read-only SQL query against Snowflake. Only SELECT, SHOW, DESCRIBE, and WITH statements are allowed.",
    {
      sql: z
        .string()
        .describe(
          "The SQL query to execute. Must be a read-only query (SELECT, SHOW, DESCRIBE, WITH)."
        ),
      database: z
        .string()
        .optional()
        .describe("The database context for the query."),
      schema: z
        .string()
        .optional()
        .describe("The schema context for the query."),
      warehouse: z
        .string()
        .optional()
        .describe("The warehouse to use for query execution."),
      max_rows: z
        .number()
        .min(1)
        .max(MAX_QUERY_ROWS)
        .optional()
        .describe(`Maximum number of rows to return. Defaults to ${MAX_QUERY_ROWS}.`),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "snowflake", agentLoopContext },
      async ({ sql, database, schema, warehouse, max_rows }, { authInfo }) => {
        const client = createSnowflakeClient(
          authInfo?.extra?.snowflake_account as string | undefined,
          authInfo?.token
        );

        if (!client) {
          return new Err(
            new MCPError(
              "Snowflake connection not configured. Please connect your Snowflake account."
            )
          );
        }

        const result = await client.query(
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
      }
    )
  );

  return server;
}

export default createServer;
