import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { MCPToolType } from "@app/lib/api/mcp";

// Tool names.
export const GET_DATABASE_SCHEMA_TOOL_NAME = "get_database_schema";
export const EXECUTE_DATABASE_QUERY_TOOL_NAME = "execute_database_query";

export const getDatabaseSchemaSchema = {
  tables: ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE],
};

export const executeDatabaseQuerySchema = {
  tables: ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE],
  query: z
    .string()
    .describe(
      "The query to execute. Must respect the guidelines provided by the `get_database_schema` tool."
    ),
  fileName: z.string().describe("The name of the file to save the results to."),
};

export const TABLES_QUERY_TOOLS: MCPToolType[] = [
  {
    name: GET_DATABASE_SCHEMA_TOOL_NAME,
    description:
      "Retrieves the database schema. You MUST call this tool at least once before attempting to query tables to understand their structure. This tool provides essential information about table columns, types, and relationships needed to write accurate SQL queries.",
    inputSchema: zodToJsonSchema(
      z.object(getDatabaseSchemaSchema)
    ) as JSONSchema,
  },
  {
    name: EXECUTE_DATABASE_QUERY_TOOL_NAME,
    description:
      "Executes a query on the database. You MUST call the get_database_schema tool for that database at least once before attempting to execute a query. The query must respect the guidelines and schema provided by the get_database_schema tool.",
    inputSchema: zodToJsonSchema(
      z.object(executeDatabaseQuerySchema)
    ) as JSONSchema,
  },
];

export const TABLES_QUERY_SERVER_INFO = {
  name: "query_tables_v2" as const,
  version: "1.0.0",
  description:
    "Query structured data like a spreadsheet or database for data analyses.",
  icon: "ActionTableIcon" as const,
  authorization: null,
  documentationUrl: null,
  instructions: null,
};
