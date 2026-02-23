import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const TABLE_QUERY_V2_SERVER_NAME = "query_tables_v2" as const; // Do not change the name until we fixed the extension
export const GET_DATABASE_SCHEMA_TOOL_NAME = "get_database_schema";
export const EXECUTE_DATABASE_QUERY_TOOL_NAME = "execute_database_query";

export const QUERY_TABLES_V2_TOOLS_METADATA = createToolsRecord({
  [GET_DATABASE_SCHEMA_TOOL_NAME]: {
    description:
      "Retrieves the database schema. You MUST call this tool at least once before attempting to query tables to understand their structure. This tool provides essential information about table columns, types, and relationships needed to write accurate SQL queries.",
    schema: {
      tables:
        ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE],
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
      "Executes a query on the database. You MUST call the get_database_schema tool for that database at least once before attempting to execute a query. The query must respect the guidelines and schema provided by the get_database_schema tool.",
    schema: {
      tables:
        ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE],
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
      "Query structured data like a spreadsheet or database for data analyses.",
    icon: "ActionTableIcon",
    authorization: null,
    documentationUrl: null,
    instructions: null,
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
