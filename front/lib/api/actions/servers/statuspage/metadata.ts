import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  ComponentStatusSchema,
  IncidentImpactSchema,
  RealTimeIncidentStatusSchema,
} from "@app/lib/api/actions/servers/statuspage/types";

export const STATUSPAGE_TOOL_NAME = "statuspage" as const;

export const STATUSPAGE_TOOLS_METADATA = createToolsRecord({
  list_pages: {
    description:
      "List all status pages accessible with the configured API key. " +
      "Use this to discover available page IDs before using other tools.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing Statuspage pages",
      done: "List Statuspage pages",
    },
  },
  list_components: {
    description:
      "List all components for a status page. " +
      "Components represent the services or systems displayed on the status page.",
    schema: {
      page_id: z
        .string()
        .describe(
          "The ID of the status page. Use list_pages to find available page IDs."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Statuspage components",
      done: "List Statuspage components",
    },
  },
  list_incidents: {
    description:
      "List incidents for a status page. " +
      "By default, returns unresolved incidents. " +
      "Use the filter parameter to get all or resolved incidents.",
    schema: {
      page_id: z
        .string()
        .describe(
          "The ID of the status page. Use list_pages to find available page IDs."
        ),
      filter: z
        .enum(["all", "unresolved", "resolved"])
        .optional()
        .default("unresolved")
        .describe(
          "Filter incidents: 'all' for all incidents, 'unresolved' (default) for active incidents, 'resolved' for past incidents."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Statuspage incidents",
      done: "List Statuspage incidents",
    },
  },
  get_incident: {
    description:
      "Get detailed information about a specific incident, " +
      "including the full update history and affected components.",
    schema: {
      page_id: z
        .string()
        .describe(
          "The ID of the status page. Use list_pages to find available page IDs."
        ),
      incident_id: z
        .string()
        .describe(
          "The ID of the incident. Use list_incidents to find incident IDs."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Statuspage incident",
      done: "Get Statuspage incident",
    },
  },
  create_incident: {
    description:
      "Create a new real-time incident on a status page. " +
      "Notifications will automatically be sent to subscribers. " +
      "Use list_components to get component IDs if you want to mark specific components as affected.",
    schema: {
      page_id: z
        .string()
        .describe(
          "The ID of the status page. Use list_pages to find available page IDs."
        ),
      name: z.string().describe("The title of the incident."),
      status: RealTimeIncidentStatusSchema.describe(
        "The current status of the incident: 'investigating', 'identified', 'monitoring', or 'resolved'."
      ),
      body: z
        .string()
        .optional()
        .describe("Optional message body describing the incident details."),
      component_ids: z
        .array(z.string())
        .optional()
        .describe(
          "Optional array of component IDs that are affected by this incident."
        ),
      component_status: ComponentStatusSchema.optional().describe(
        "Optional status to set for affected components: 'operational', 'degraded_performance', 'partial_outage', 'major_outage', or 'under_maintenance'."
      ),
      impact_override: IncidentImpactSchema.optional().describe(
        "Optional override for incident impact level: 'none', 'minor', 'major', or 'critical'."
      ),
    },
    stake: "high",
    displayLabels: {
      running: "Creating Statuspage incident",
      done: "Create Statuspage incident",
    },
  },
  update_incident: {
    description:
      "Update an existing incident on a status page. " +
      "Notifications will automatically be sent to subscribers. " +
      "Use this to post status updates, change the incident status, or update affected components.",
    schema: {
      page_id: z
        .string()
        .describe(
          "The ID of the status page. Use list_pages to find available page IDs."
        ),
      incident_id: z
        .string()
        .describe(
          "The ID of the incident to update. Use list_incidents to find incident IDs."
        ),
      status: RealTimeIncidentStatusSchema.optional().describe(
        "Optional new status for the incident: 'investigating', 'identified', 'monitoring', or 'resolved'."
      ),
      body: z
        .string()
        .optional()
        .describe("Optional update message to add to the incident timeline."),
      component_ids: z
        .array(z.string())
        .optional()
        .describe(
          "Optional array of component IDs to update as affected by this incident."
        ),
      component_status: ComponentStatusSchema.optional().describe(
        "Optional status to set for affected components: 'operational', 'degraded_performance', 'partial_outage', 'major_outage', or 'under_maintenance'."
      ),
    },
    stake: "high",
    displayLabels: {
      running: "Updating Statuspage incident",
      done: "Update Statuspage incident",
    },
  },
});

export const STATUSPAGE_SERVER = {
  serverInfo: {
    name: "statuspage",
    version: "1.0.0",
    description: "Monitor and manage Atlassian Statuspage incidents.",
    authorization: null,
    icon: "StatuspageLogo",
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(STATUSPAGE_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(STATUSPAGE_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
