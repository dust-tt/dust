import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const SNOWFLAKE_TOOL_NAME = "snowflake" as const;
export const MAX_QUERY_ROWS = 1000;

export const SNOWFLAKE_TOOLS_METADATA = createToolsRecord({
  list_databases: {
    description:
      "List all databases accessible to the authenticated Snowflake user.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing Snowflake databases",
      done: "List Snowflake databases",
    },
  },
  list_schemas: {
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
  list_tables: {
    description:
      "List all tables and views within a specified Snowflake schema.",
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
  describe_table: {
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
  query: {
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
    // Predates the introduction of the rule, would require extensive work to
    // improve, already widely adopted.

    instructions:
      // biome-ignore lint/plugin/noMcpServerInstructions: existing usage
      "Use list_databases, list_schemas, list_tables, and describe_table to explore the schema before writing queries. Only SELECT queries are allowed.",
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
