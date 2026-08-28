import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

const ADDITIONAL_FIELDS_SCHEMA = {
  additionalFields: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()])
    )
    .optional()
    .describe(
      "Customer-specific or custom (e.g. 'u_*') field values, keyed by the raw ServiceNow field name. Flat scalar values only — no nested objects or arrays. Do not use this for fields already covered by a dedicated parameter (e.g. priority, state, assignmentGroup)."
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

const WRITABLE_INCIDENT_FIELDS_SCHEMA = {
  description: z
    .string()
    .optional()
    .describe("Full description of the incident."),
  urgency: z
    .string()
    .optional()
    .describe("Urgency, e.g. '1 - High', '2 - Medium', '3 - Low'."),
  impact: z
    .string()
    .optional()
    .describe("Impact, e.g. '1 - High', '2 - Medium', '3 - Low'."),
  priority: z
    .string()
    .optional()
    .describe(
      "Priority, e.g. '1 - Critical', '2 - High', '3 - Moderate', '4 - Low', '5 - Planning'."
    ),
  category: z.string().optional().describe("Incident category."),
  assignmentGroup: z
    .string()
    .optional()
    .describe("Name of the assignment group to assign the incident to."),
};

export const SERVICENOW_TOOLS_METADATA = [
  {
    name: "list_incidents",
    description:
      "List ServiceNow incidents (tickets) in the connected instance. Supports filtering with a ServiceNow encoded query.",
    schema: {
      query: z
        .string()
        .optional()
        .describe(
          "ServiceNow encoded query (sysparm_query) to filter incidents, e.g. 'active=true^priority=1'."
        ),
      limit: z
        .number()
        .optional()
        .describe(
          "Maximum number of incidents to return per page. Defaults to 25, capped at 1000."
        ),
      fields: z
        .array(z.string())
        .optional()
        .describe(
          "Restrict the response to these ServiceNow field names (sys_id and number are always included)."
        ),
      openedAfter: z
        .string()
        .optional()
        .describe(
          "Only include incidents opened on or after this ISO 8601 timestamp, e.g. '2026-01-01T00:00:00Z'."
        ),
      openedBefore: z
        .string()
        .optional()
        .describe(
          "Only include incidents opened on or before this ISO 8601 timestamp."
        ),
      updatedAfter: z
        .string()
        .optional()
        .describe(
          "Only include incidents last updated on or after this ISO 8601 timestamp."
        ),
      updatedBefore: z
        .string()
        .optional()
        .describe(
          "Only include incidents last updated on or before this ISO 8601 timestamp."
        ),
      ...PAGINATION_SCHEMA,
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing ServiceNow incidents",
      done: "List ServiceNow incidents",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "get_incident",
    description:
      "Get a single ServiceNow incident (ticket) by its number, e.g. 'INC0010001'.",
    schema: {
      incidentNumber: z
        .string()
        .describe("The ServiceNow incident number, e.g. 'INC0010001'."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving ServiceNow incident",
      done: "Retrieve ServiceNow incident",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "create_incident",
    description:
      "Create (open) a new ServiceNow incident (ticket) in the connected instance.",
    schema: {
      shortDescription: z.string().describe("Short summary of the incident."),
      ...WRITABLE_INCIDENT_FIELDS_SCHEMA,
      ...ADDITIONAL_FIELDS_SCHEMA,
    },
    stake: "low",
    displayLabels: {
      running: "Creating ServiceNow incident",
      done: "Create ServiceNow incident",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "update_incident",
    description:
      "Update, resolve, or close an existing ServiceNow incident (ticket) identified by its number, e.g. 'INC0010001'.",
    schema: {
      incidentNumber: z
        .string()
        .describe("The ServiceNow incident number, e.g. 'INC0010001'."),
      shortDescription: z
        .string()
        .optional()
        .describe("Replacement short summary of the incident."),
      state: z
        .string()
        .optional()
        .describe(
          "State to move the incident to, e.g. 'In Progress', 'Resolved', 'Closed'."
        ),
      priority: z
        .string()
        .optional()
        .describe(
          "Priority, e.g. '1 - Critical', '2 - High', '3 - Moderate', '4 - Low', '5 - Planning'."
        ),
      workNotes: z
        .string()
        .optional()
        .describe(
          "Work note to add to the incident (internal, not customer-visible)."
        ),
      closeNotes: z
        .string()
        .optional()
        .describe(
          "Resolution notes, typically set when resolving/closing the incident."
        ),
      resolutionCode: z
        .string()
        .optional()
        .describe(
          "Resolution code. Required by ServiceNow to move state to 'Resolved' or 'Closed'. Valid values are configured per ServiceNow instance (e.g. 'Solution provided', 'Resolved by caller') — if unsure, call list_incidents on an already-resolved incident to see a value your instance accepts."
        ),
      ...ADDITIONAL_FIELDS_SCHEMA,
    },
    stake: "low",
    displayLabels: {
      running: "Updating ServiceNow incident",
      done: "Update ServiceNow incident",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "list_records",
    description:
      "List records from any ServiceNow table the connected account has access to (e.g. incident, problem, change_request, sc_request, kb_knowledge, or a custom table). Supports filtering with a ServiceNow encoded query.",
    schema: {
      table: z
        .string()
        .describe(
          "The ServiceNow table name to query, e.g. 'incident', 'problem', 'change_request', 'sc_request', 'kb_knowledge', or any other table (including custom 'u_*' tables) the connected account has access to. ServiceNow will reject the request if the table doesn't exist or the connected account lacks access to it."
        ),
      query: z
        .string()
        .optional()
        .describe(
          "ServiceNow encoded query (sysparm_query) to filter records, e.g. 'active=true^priority=1'."
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
      "Get a single record from any ServiceNow table the connected account has access to (e.g. incident, problem, change_request, sc_request, kb_knowledge, or a custom table) by its sys_id.",
    schema: {
      table: z
        .string()
        .describe(
          "The ServiceNow table name to query, e.g. 'incident', 'problem', 'change_request', 'sc_request', 'kb_knowledge', or any other table (including custom 'u_*' tables) the connected account has access to. ServiceNow will reject the request if the table doesn't exist or the connected account lacks access to it."
        ),
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
] as const;

export const SERVICENOW_SERVER = {
  serverInfo: {
    name: "servicenow",
    version: "1.0.0",
    description: "Read and manage incidents and records in ServiceNow.",
    authorization: {
      provider: "servicenow",
      supported_use_cases: ["platform_actions", "personal_actions"],
    },
    icon: "ActionCloudArrowLeftRightIcon",
    documentationUrl: "https://docs.dust.tt/docs/servicenow",
  },
  tools: SERVICENOW_TOOLS_METADATA,
} as const satisfies ServerMetadata;
