import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const MAX_QUERY_ROWS = 1000;

export const SNOWFLAKE_LIST_DATABASES_TOOL_NAME = "list_databases" as const;
export const SNOWFLAKE_LIST_SCHEMAS_TOOL_NAME = "list_schemas" as const;
export const SNOWFLAKE_LIST_TABLES_TOOL_NAME = "list_tables" as const;
export const SNOWFLAKE_DESCRIBE_TABLE_TOOL_NAME = "describe_table" as const;
export const SNOWFLAKE_DESCRIBE_SEMANTIC_VIEW_TOOL_NAME =
  "describe_semantic_view" as const;
export const SNOWFLAKE_QUERY_TOOL_NAME = "query" as const;

export const SNOWFLAKE_TOOLS_METADATA = createToolsRecord({
  [SNOWFLAKE_LIST_DATABASES_TOOL_NAME]: {
    description:
      "List all databases accessible to the authenticated Snowflake user.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing Snowflake databases",
      done: "List Snowflake databases",
    },
  },
  [SNOWFLAKE_LIST_SCHEMAS_TOOL_NAME]: {
    description: "List all schemas within a specified Snowflake database.",
    schema: {
      database: z
        .string()
        .describe("The name of the database to list schemas from."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Snowflake schemas",
      done: "List Snowflake schemas",
    },
  },
  [SNOWFLAKE_LIST_TABLES_TOOL_NAME]: {
    description:
      "List all tables, views, and semantic views within a specified Snowflake schema.",
    schema: {
      database: z.string().describe("The name of the database."),
      schema: z
        .string()
        .describe("The name of the schema to list tables from."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Snowflake tables",
      done: "List Snowflake tables",
    },
  },
  [SNOWFLAKE_DESCRIBE_TABLE_TOOL_NAME]: {
    description:
      "Get the schema (column names, types, and constraints) of a Snowflake table.",
    schema: {
      database: z.string().describe("The name of the database."),
      schema: z.string().describe("The name of the schema."),
      table: z.string().describe("The name of the table to describe."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Describing Snowflake table",
      done: "Describe Snowflake table",
    },
  },
  [SNOWFLAKE_DESCRIBE_SEMANTIC_VIEW_TOOL_NAME]: {
    description: `Get the structure (dimensions and metrics) of a Snowflake semantic view. Use this instead of ${SNOWFLAKE_DESCRIBE_TABLE_TOOL_NAME} when the object kind is SEMANTIC_VIEW.`,
    schema: {
      database: z.string().describe("The name of the database."),
      schema: z.string().describe("The name of the schema."),
      semantic_view: z
        .string()
        .describe("The name of the semantic view to describe."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Describing Snowflake semantic view",
      done: "Describe Snowflake semantic view",
    },
  },
  [SNOWFLAKE_QUERY_TOOL_NAME]: {
    description: `Execute a read-only SQL query against Snowflake. Only SELECT queries are allowed; write operations are not permitted. Before writing a query, use ${SNOWFLAKE_LIST_DATABASES_TOOL_NAME}, ${SNOWFLAKE_LIST_SCHEMAS_TOOL_NAME}, ${SNOWFLAKE_LIST_TABLES_TOOL_NAME}, and ${SNOWFLAKE_DESCRIBE_TABLE_TOOL_NAME} (or ${SNOWFLAKE_DESCRIBE_SEMANTIC_VIEW_TOOL_NAME} for semantic views) to explore the schema.`,
    schema: {
      sql: z
        .string()
        .describe("The SQL query to execute. Must be a read-only query."),
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
        .int()
        .min(1)
        .max(MAX_QUERY_ROWS)
        .optional()
        .describe(
          `Maximum number of rows to return. Defaults to ${MAX_QUERY_ROWS}.`
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Executing Snowflake query",
      done: "Execute Snowflake query",
    },
  },
});

export const SNOWFLAKE_SERVER = {
  serverInfo: {
    name: "snowflake",
    version: "1.0.0",
    description:
      "Execute read-only SQL queries and browse schema in Snowflake.",
    authorization: {
      provider: "snowflake",
      supported_use_cases: ["personal_actions", "platform_actions"],
    },
    icon: "SnowflakeLogo",
    documentationUrl: "https://docs.dust.tt/docs/snowflake-tool",
    instructions: null,
  },
  tools: Object.values(SNOWFLAKE_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(SNOWFLAKE_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
