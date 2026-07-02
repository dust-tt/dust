import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// Constants
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// Common schema for data sources
const dataSourcesSchema =
  ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_WAREHOUSE];

// Tools metadata
export const DATA_WAREHOUSES_TOOLS_METADATA = createToolsRecord({
  list: {
    description:
      "Browse and list the direct contents inside a warehouse, database, or schema: child databases, schemas, nested schemas, and tables. " +
      "Use this to explore or navigate the tables hierarchy, like 'ls' in Unix. If no nodeId is provided, shows " +
      "all available data warehouses at the root level. Hierarchy supports: warehouse → database → schema → " +
      "nested schemas → tables. Schemas can be arbitrarily nested within other schemas. Results are paginated " +
      "with a default limit and you can fetch additional pages using the nextPageCursor.",
    schema: {
      dataSources: dataSourcesSchema,
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
    },
    stake: "never_ask",
    enableAlerting: true,
    displayLabels: {
      running: "Listing warehouse contents",
      done: "List warehouse contents",
    },
  },
  find: {
    description:
      "Find, search, or locate tables, schemas, and databases by name starting from a specific node in the warehouse hierarchy. " +
      "Use this for table-name lookup when you know a full or partial table, schema, or database name. " +
      "The query supports partial matching - for example, searching for 'customer' will find " +
      "'customer_profiles', 'dim_customers', etc. This is like using 'find' in Unix for tables.",
    schema: {
      dataSources: dataSourcesSchema,
      query: z
        .string()
        .optional()
        .describe(
          "The table name to search for. This supports partial matching and does not require the " +
            "exact name. For example, searching for 'invoice' will find 'invoices', " +
            "'invoice_lines', 'archived_invoices', etc. If omitted, lists all tables."
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
    },
    stake: "never_ask",
    enableAlerting: true,
    displayLabels: {
      running: "Finding tables in warehouse",
      done: "Find tables in warehouse",
    },
  },
  describe_tables: {
    description:
      "Describe known warehouse tables by retrieving their schema details: columns, types, DBML definitions, " +
      "SQL dialect-specific query guidelines, and example rows. All tables must be from the same " +
      "warehouse - cross-warehouse schema requests are not supported. Use this to understand table " +
      "structure before writing SQL queries.",
    schema: {
      dataSources: dataSourcesSchema,
      tableIds: z
        .array(z.string())
        .min(1)
        .describe(
          "Array of table identifiers in the format 'table-<dataSourceId>-<nodeId>'. " +
            "All tables must be from the same warehouse (same dataSourceId)."
        ),
    },
    stake: "never_ask",
    enableAlerting: true,
    displayLabels: {
      running: "Describing warehouse tables",
      done: "Describe warehouse tables",
    },
  },
  query: {
    description:
      "Run, execute, or write SQL queries on selected data warehouse tables to calculate metrics, aggregate results, analyze revenue, or answer business questions. " +
      "You MUST call describe_tables at least once before attempting to query tables to understand their structure. The query must respect the SQL dialect " +
      "and guidelines provided by describe_tables. All tables in a single query must be from the same warehouse.",
    schema: {
      dataSources: dataSourcesSchema,
      tableIds: z
        .array(z.string())
        .min(1)
        .describe(
          "Array of table identifiers in the format 'table-<dataSourceId>-<nodeId>'. " +
            "All tables must be from the same warehouse (same dataSourceId)."
        ),
      description: z
        .string()
        .describe(
          "The reason this query is being run and what it achieves, in a few words. Use infinitive verbs (e.g. " +
            '"Analyze revenue trends", "Identify top customers").'
        ),
      query: z
        .string()
        .describe(
          "The SQL query to execute. Must respect the SQL dialect and guidelines provided by describe_tables."
        ),
      fileName: z
        .string()
        .describe("The name of the file to save the results to."),
    },
    stake: "never_ask",
    enableAlerting: true,
    displayLabels: {
      running: "Running warehouse query",
      done: "Run warehouse query",
    },
  },
});

// Server metadata - used in constants.ts
export const DATA_WAREHOUSES_SERVER = {
  serverInfo: {
    name: "data_warehouses",
    version: "1.0.0",
    description: "Browse tables organized by warehouse and schema.",
    authorization: null,
    icon: "ActionTableIcon",
    documentationUrl: null,
    toolCategory: "advanced",
  },
  tools: Object.values(DATA_WAREHOUSES_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(DATA_WAREHOUSES_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
