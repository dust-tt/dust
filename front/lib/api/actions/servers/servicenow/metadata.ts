import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

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
        .describe("Maximum number of incidents to return. Defaults to 25."),
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
      "Update, resolve, or close an existing ServiceNow incident (ticket) identified by its sys_id (returned by list_incidents/get_incident).",
    schema: {
      sysId: z.string().describe("The sys_id of the incident to update."),
      shortDescription: z
        .string()
        .optional()
        .describe("New short summary of the incident."),
      state: z
        .string()
        .optional()
        .describe(
          "New state, e.g. 'New', 'In Progress', 'Resolved', 'Closed'."
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
          "Resolution code. Required by ServiceNow to move state to 'Resolved' or 'Closed', e.g. 'Solved (Permanently)', 'Solved (Work Around)', 'Closed/Resolved by Caller'."
        ),
      ...WRITABLE_INCIDENT_FIELDS_SCHEMA,
    },
    stake: "low",
    displayLabels: {
      running: "Updating ServiceNow incident",
      done: "Update ServiceNow incident",
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
