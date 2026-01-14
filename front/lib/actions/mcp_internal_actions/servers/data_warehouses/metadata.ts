import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { MCPToolType } from "@app/lib/api/mcp";

// Tool name for monitoring (all tools in this server use the same monitoring name).
export const DATA_WAREHOUSES_TOOL_NAME =
  "tables_filesystem_navigation" as const;

// Tool names for each tool.
export const DATA_WAREHOUSES_LIST_TOOL_NAME = "list";
export const DATA_WAREHOUSES_FIND_TOOL_NAME = "find";
export const DATA_WAREHOUSES_DESCRIBE_TABLES_TOOL_NAME = "describe_tables";
export const DATA_WAREHOUSES_QUERY_TOOL_NAME = "query";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export const listSchema = {
  dataSources:
    ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_WAREHOUSE],
  nodeId: z
    .string()
    .nullable()
    .describe(
      "The ID of the warehouse, database, or schema to list contents of. " +
        "If not provided, lists all available data warehouses at the root."
    ),
  limit: z
    .number()
    .optional()
    .describe(
      `Maximum number of results to return. Default is ${DEFAULT_LIMIT}, max is ${MAX_LIMIT}.`
    ),
  nextPageCursor: z
    .string()
    .optional()
    .describe(
      "Cursor for fetching the next page of results. Use the 'nextPageCursor' from " +
        "the previous list result to fetch additional items."
    ),
};

export const findSchema = {
  dataSources:
    ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_WAREHOUSE],
  query: z
    .string()
    .optional()
    .describe(
      "The table name to search for. This supports partial matching and does not require the " +
        "exact name. For example, searching for 'revenue' will find 'revenue_2024', " +
        "'monthly_revenue', 'revenue_by_region', etc. If omitted, lists all tables."
    ),
  rootNodeId: z
    .string()
    .optional()
    .describe(
      "The node ID to start the search from (warehouse, database, or schema ID). " +
        "If not provided, searches across all available warehouses. This restricts the " +
        "search to the specified node and all its descendants."
    ),
  limit: z
    .number()
    .optional()
    .describe(
      `Maximum number of results to return. Default is ${DEFAULT_LIMIT}, max is ${MAX_LIMIT}.`
    ),
  nextPageCursor: z
    .string()
    .optional()
    .describe(
      "Cursor for fetching the next page of results. Use the 'nextPageCursor' from " +
        "the previous find result to fetch additional items."
    ),
};

export const describeTablesSchema = {
  dataSources:
    ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_WAREHOUSE],
  tableIds: z
    .array(z.string())
    .min(1)
    .describe(
      "Array of table identifiers in the format 'table-<dataSourceId>-<nodeId>'. " +
        "All tables must be from the same warehouse (same dataSourceId)."
    ),
};

export const querySchema = {
  dataSources:
    ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_WAREHOUSE],
  tableIds: z
    .array(z.string())
    .min(1)
    .describe(
      "Array of table identifiers in the format 'table-<dataSourceId>-<nodeId>'. " +
        "All tables must be from the same warehouse (same dataSourceId)."
    ),
  query: z
    .string()
    .describe(
      "The SQL query to execute. Must respect the SQL dialect and guidelines provided by describe_tables."
    ),
  fileName: z.string().describe("The name of the file to save the results to."),
};

export const DATA_WAREHOUSES_TOOLS: MCPToolType[] = [
  {
    name: DATA_WAREHOUSES_LIST_TOOL_NAME,
    description:
      "List the direct contents of a warehouse, database, or schema. Can be used to see what is inside a " +
      "specific location in the tables hierarchy, like 'ls' in Unix. If no nodeId is provided, lists " +
      "all available data warehouses at the root level. Hierarchy supports: warehouse → database → schema → " +
      "nested schemas → tables. Schemas can be arbitrarily nested within other schemas. Results are paginated " +
      "with a default limit and you can fetch additional pages using the nextPageCursor.",
    inputSchema: zodToJsonSchema(z.object(listSchema)) as JSONSchema,
  },
  {
    name: DATA_WAREHOUSES_FIND_TOOL_NAME,
    description:
      "Find tables, schemas and databases based on their name starting from a specific node in the tables hierarchy. " +
      "Can be used to search for tables by name across warehouses, databases, and schemas. " +
      "The query supports partial matching - for example, searching for 'sales' will find " +
      "'sales_2024', 'monthly_sales_report', etc. This is like using 'find' in Unix for tables.",
    inputSchema: zodToJsonSchema(z.object(findSchema)) as JSONSchema,
  },
  {
    name: DATA_WAREHOUSES_DESCRIBE_TABLES_TOOL_NAME,
    description:
      "Get detailed schema information for one or more tables. Provides DBML schema definitions, " +
      "SQL dialect-specific query guidelines, and example rows. All tables must be from the same " +
      "warehouse - cross-warehouse schema requests are not supported. Use this to understand table " +
      "structure before writing queries.",
    inputSchema: zodToJsonSchema(z.object(describeTablesSchema)) as JSONSchema,
  },
  {
    name: DATA_WAREHOUSES_QUERY_TOOL_NAME,
    description:
      "Execute SQL queries on tables from the same warehouse. You MUST call describe_tables at least once " +
      "before attempting to query tables to understand their structure. The query must respect the SQL dialect " +
      `and guidelines provided by ${DATA_WAREHOUSES_DESCRIBE_TABLES_TOOL_NAME}. All tables in a single query must be from the same warehouse.`,
    inputSchema: zodToJsonSchema(z.object(querySchema)) as JSONSchema,
  },
];

export const DATA_WAREHOUSES_SERVER_INFO = {
  name: "data_warehouses" as const,
  version: "1.0.0",
  description: "Browse tables organized by warehouse and schema.",
  authorization: null,
  icon: "ActionTableIcon" as const,
  documentationUrl: null,
  instructions: null,
};
