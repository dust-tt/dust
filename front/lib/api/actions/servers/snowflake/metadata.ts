import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { MCPToolType } from "@app/lib/api/mcp";
import type { MCPOAuthUseCase } from "@app/types";

export const SNOWFLAKE_TOOL_NAME = "snowflake" as const;
export const MAX_QUERY_ROWS = 1000;

export const listDatabasesMeta = {
  name: "list_databases" as const,
  description:
    "List all databases accessible to the authenticated Snowflake user.",
  schema: {},
  stake: "never_ask" as MCPToolStakeLevelType,
};

export const listSchemasMeta = {
  name: "list_schemas" as const,
  description: "List all schemas within a specified Snowflake database.",
  schema: {
    database: z
      .string()
      .describe("The name of the database to list schemas from."),
  },
  stake: "never_ask" as MCPToolStakeLevelType,
};

export const listTablesMeta = {
  name: "list_tables" as const,
  description: "List all tables and views within a specified Snowflake schema.",
  schema: {
    database: z.string().describe("The name of the database."),
    schema: z.string().describe("The name of the schema to list tables from."),
  },
  stake: "never_ask" as MCPToolStakeLevelType,
};

export const describeTableMeta = {
  name: "describe_table" as const,
  description:
    "Get the schema (column names, types, and constraints) of a Snowflake table.",
  schema: {
    database: z.string().describe("The name of the database."),
    schema: z.string().describe("The name of the schema."),
    table: z.string().describe("The name of the table to describe."),
  },
  stake: "never_ask" as MCPToolStakeLevelType,
};

export const queryMeta = {
  name: "query" as const,
  description:
    "Execute a read-only SQL query against Snowflake. Write operations are not allowed. Use the dedicated tools for listing databases, schemas, tables, and describing table structure.",
  schema: {
    sql: z
      .string()
      .describe("The SQL query to execute. Must be a read-only query."),
    database: z
      .string()
      .optional()
      .describe("The database context for the query."),
    schema: z.string().optional().describe("The schema context for the query."),
    warehouse: z
      .string()
      .optional()
      .describe("The warehouse to use for query execution."),
    max_rows: z
      .number()
      .int()
      .min(1)
      .max(MAX_QUERY_ROWS)
      .optional()
      .describe(
        `Maximum number of rows to return. Defaults to ${MAX_QUERY_ROWS}.`
      ),
  },
  stake: "never_ask" as MCPToolStakeLevelType,
};

export const TOOLS_META = [
  listDatabasesMeta,
  listSchemasMeta,
  listTablesMeta,
  describeTableMeta,
  queryMeta,
];

export const SNOWFLAKE_TOOLS: MCPToolType[] = TOOLS_META.map((t) => ({
  name: t.name,
  description: t.description,
  inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
}));

export const SNOWFLAKE_TOOL_STAKES: Record<string, MCPToolStakeLevelType> =
  Object.fromEntries(TOOLS_META.map((t) => [t.name, t.stake]));

export const SNOWFLAKE_SERVER_INFO = {
  name: "snowflake" as const,
  version: "1.0.0",
  description: "Execute read-only SQL queries and browse schema in Snowflake.",
  authorization: {
    provider: "snowflake" as const,
    supported_use_cases: ["personal_actions"] as MCPOAuthUseCase[],
  },
  icon: "SnowflakeLogo" as const,
  documentationUrl: "https://docs.dust.tt/docs/snowflake-tool",
  instructions:
    "Use list_databases, list_schemas, list_tables, and describe_table to explore the schema before writing queries. Only SELECT queries are allowed.",
};

export const SNOWFLAKE_SERVER = {
  serverInfo: SNOWFLAKE_SERVER_INFO,
  tools: SNOWFLAKE_TOOLS,
  tools_stakes: SNOWFLAKE_TOOL_STAKES,
} as const satisfies ServerMetadata;
