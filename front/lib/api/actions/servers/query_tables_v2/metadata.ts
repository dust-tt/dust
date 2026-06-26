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
      "List all tables available to this agent. Returns lightweight table metadata and URIs. " +
      "Call this first to discover tables, then pass selected URIs to get_database_schema.",
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
  },
  [GET_DATABASE_SCHEMA_TOOL_NAME]: {
    description:
      "Retrieves the database schema for a subset of tables. You MUST call list_tables first to discover " +
      "available tables, then call this tool with the URIs of the tables you need before attempting to query. " +
      "This tool provides essential information about table columns, types, and relationships needed to write accurate SQL queries.",
    schema: {
      tableUris: tableUrisSchema,
    },
    stake: "never_ask",
    enableAlerting: true,
    displayLabels: {
      running: "Getting database schema",
      done: "Get database schema",
    },
  },
  [EXECUTE_DATABASE_QUERY_TOOL_NAME]: {
    description:
      "Executes a query on the database. You MUST call get_database_schema for the tables involved in your query " +
      "at least once before attempting to execute a query. The query must respect the guidelines and schema " +
      "provided by the get_database_schema tool.",
    schema: {
      tables:
        ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE],
      description: z
        .string()
        .describe(
          "The reason this query is being run and what it achieves, in a few words. Use infinitive verbs (e.g. " +
            '"Analyze revenue trends", "Identify top customers").'
        ),
      query: z
        .string()
        .describe(
          "The query to execute. Must respect the guidelines provided by the `get_database_schema` tool."
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
  })),
  tools_stakes: Object.fromEntries(
    Object.values(QUERY_TABLES_V2_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
