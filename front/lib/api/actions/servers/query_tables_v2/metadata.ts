import {
  ConfigurableToolInputSchemas,
  TABLE_CONFIGURATION_URI_PATTERN,
} from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const TABLE_QUERY_V2_SERVER_NAME = "query_tables_v2" as const; // Do not change the name until we fixed the extension
export const LIST_TABLES_TOOL_NAME = "list_tables";
export const GET_DATABASE_SCHEMA_TOOL_NAME = "get_database_schema";
export const EXECUTE_DATABASE_QUERY_TOOL_NAME = "execute_database_query";

const tableUriSchema = z
  .string()
  .regex(TABLE_CONFIGURATION_URI_PATTERN)
  .describe(
    "A table URI in the format returned by list_tables, e.g. " +
      "'table_configuration://dust/w/{workspaceId}/data_source_views/{viewId}/tables/{tableId}'."
  );

const tableUrisSchema = z
  .array(tableUriSchema)
  .min(1)
  .describe(
    "Table URIs to retrieve schema for. Use URIs returned by list_tables."
  );

export const QUERY_TABLES_V2_TOOLS_METADATA = createToolsRecord({
  [LIST_TABLES_TOOL_NAME]: {
    description:
      "List and discover the agent-configured structured data tables, datasets, and table URIs available to this agent. " +
      "Returns lightweight table metadata and URIs. Call this first to find available agent tables, then pass selected URIs to get_database_schema.",
    schema: {
      tables:
        ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE],
    },
    stake: "never_ask",
    enableAlerting: true,
    displayLabels: {
      running: "Listing available tables",
      done: "List available tables",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  [GET_DATABASE_SCHEMA_TOOL_NAME]: {
    description:
      "Inspect the schema and structure for selected agent-configured tables before SQL. Use this to answer which columns, fields, column names, sample rows, and relationships exist in tables selected from list_tables. " +
      "You MUST call list_tables first, then call this tool with the URIs of the tables you need before running SQL.",
    schema: {
      tableUris: tableUrisSchema,
    },
    stake: "never_ask",
    enableAlerting: true,
    displayLabels: {
      running: "Getting database schema",
      done: "Get database schema",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  [EXECUTE_DATABASE_QUERY_TOOL_NAME]: {
    description:
      "Run and execute SQL against selected agent-configured structured data tables to analyze, aggregate, filter, join, or export result rows. " +
      "Before using this tool, the agent should have already called get_database_schema for every involved table URI and should use that inspected table structure to write the SQL. " +
      "The SQL query must respect the guidelines and schema returned by get_database_schema.",
    schema: {
      tables:
        ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE],
      description: z
        .string()
        .describe(
          "The reason this query is being run and what it achieves, in a few words. Use infinitive verbs (e.g. " +
            '"Analyze trends", "Identify top customers").'
        ),
      query: z
        .string()
        .describe(
          "The SQL query to execute. Must respect the guidelines provided by the schema inspection tool."
        ),
      fileName: z
        .string()
        .describe("The name of the file to save the results to."),
    },
    stake: "never_ask",
    enableAlerting: true,
    displayLabels: {
      running: "Executing database query",
      done: "Execute database query",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
});

export const QUERY_TABLES_V2_SERVER = {
  serverInfo: {
    name: TABLE_QUERY_V2_SERVER_NAME,
    version: "1.0.0",
    description:
      "Query structured data like a spreadsheet or database. Use list_tables to discover available tables, " +
      "get_database_schema for the tables you need, then execute_database_query to run SQL analyses.",
    icon: "ActionTableIcon",
    authorization: null,
    documentationUrl: null,
  },
  tools: Object.values(QUERY_TABLES_V2_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
    toolCostCategory: t.toolCostCategory,
    freeUsage: t.freeUsage,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(QUERY_TABLES_V2_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
