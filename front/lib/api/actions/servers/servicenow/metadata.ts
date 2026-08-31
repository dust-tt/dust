import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

const TABLE_SCHEMA = {
  table: z
    .string()
    .describe(
      "The ServiceNow table name, e.g. 'incident', 'problem', 'change_request', 'sc_request', 'kb_knowledge', or any other table (including custom 'u_*' tables) the connected account has access to. ServiceNow will reject the request if the table doesn't exist or the connected account lacks access to it."
    ),
};

const WRITE_FIELDS_SCHEMA = {
  fields: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()])
    )
    .describe(
      "Field values to set, keyed by the raw ServiceNow field name, or a custom 'u_*' field. Flat scalar values only; no nested objects or arrays. Use human-readable choice labels where applicable, e.g. '1 - Critical' for priority. On incident-like tables, common fields include 'short_description', 'description', 'priority', 'urgency', 'impact', 'category', 'assignment_group', 'state' (e.g. 'In Progress', 'Resolved', 'Closed'), 'work_notes' (internal, not customer-visible), 'close_notes' (resolution notes), and 'close_code' (resolution code, required by ServiceNow to move state to 'Resolved' or 'Closed'; if unsure which value your instance accepts, call list_records on an already-resolved record to see one)."
    ),
};

const PAGINATION_SCHEMA = {
  cursor: z
    .string()
    .optional()
    .describe(
      "Opaque pagination cursor from a previous call's nextCursor. Omit to start from the first page."
    ),
  includeTotalCount: z
    .boolean()
    .optional()
    .describe(
      "Include the total number of matching records. This runs an extra, more expensive query against the instance. Defaults to false."
    ),
};

export const SERVICENOW_TOOLS_METADATA = [
  {
    name: "list_records",
    description:
      "List records from any ServiceNow table the connected account has access to (e.g. incident (ticket), problem, change_request, sc_request, kb_knowledge, or a custom table). Supports filtering with a ServiceNow encoded query.",
    schema: {
      ...TABLE_SCHEMA,
      query: z
        .string()
        .optional()
        .describe(
          "ServiceNow encoded query (sysparm_query) to filter records, e.g. 'active=true^priority=1'. Must not include an ORDERBY/ORDERBYDESC clause; results are always sorted by sys_id to keep pagination correct."
        ),
      fields: z
        .array(z.string())
        .optional()
        .describe(
          "Restrict the response to these ServiceNow field names (sys_id is always included)."
        ),
      limit: z
        .number()
        .optional()
        .describe(
          "Maximum number of records to return per page. Defaults to 25, capped at 1000."
        ),
      createdAfter: z
        .string()
        .optional()
        .describe(
          "Only include records created on or after this ISO 8601 timestamp, e.g. '2026-01-01T00:00:00Z'."
        ),
      createdBefore: z
        .string()
        .optional()
        .describe(
          "Only include records created on or before this ISO 8601 timestamp."
        ),
      updatedAfter: z
        .string()
        .optional()
        .describe(
          "Only include records last updated on or after this ISO 8601 timestamp."
        ),
      updatedBefore: z
        .string()
        .optional()
        .describe(
          "Only include records last updated on or before this ISO 8601 timestamp."
        ),
      ...PAGINATION_SCHEMA,
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing ServiceNow records",
      done: "List ServiceNow records",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "get_record",
    description:
      "Get a single record from any ServiceNow table the connected account has access to (e.g. incident (ticket), problem, change_request, sc_request, kb_knowledge, or a custom table) by its sys_id.",
    schema: {
      ...TABLE_SCHEMA,
      sysId: z
        .string()
        .describe(
          "The record's sys_id, a 32-character hexadecimal identifier."
        ),
      fields: z
        .array(z.string())
        .optional()
        .describe(
          "Restrict the response to these ServiceNow field names (sys_id is always included)."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving ServiceNow record",
      done: "Retrieve ServiceNow record",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "create_record",
    description:
      "Create (open) a new record in any ServiceNow table the connected account has access to (e.g. incident (ticket), problem, change_request, sc_request, kb_knowledge, or a custom table).",
    schema: {
      ...TABLE_SCHEMA,
      ...WRITE_FIELDS_SCHEMA,
    },
    stake: "low",
    displayLabels: {
      running: "Creating ServiceNow record",
      done: "Create ServiceNow record",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "update_record",
    description:
      "Update, resolve, or close an existing record in any ServiceNow table the connected account has access to (e.g. incident (ticket), problem, change_request, sc_request, kb_knowledge, or a custom table), identified by its sys_id.",
    schema: {
      ...TABLE_SCHEMA,
      sysId: z
        .string()
        .describe(
          "The record's sys_id, a 32-character hexadecimal identifier."
        ),
      ...WRITE_FIELDS_SCHEMA,
    },
    stake: "low",
    displayLabels: {
      running: "Updating ServiceNow record",
      done: "Update ServiceNow record",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
] as const;

export const SERVICENOW_SERVER = {
  serverInfo: {
    name: "servicenow",
    version: "1.0.0",
    description: "Read and manage records in ServiceNow.",
    authorization: {
      provider: "servicenow",
      supported_use_cases: ["platform_actions", "personal_actions"],
    },
    icon: "ActionCloudArrowLeftRightIcon",
    documentationUrl: "https://docs.dust.tt/docs/servicenow",
  },
  tools: SERVICENOW_TOOLS_METADATA,
} as const satisfies ServerMetadata;
