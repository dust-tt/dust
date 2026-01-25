import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { getStatuspageClient } from "@app/lib/actions/mcp_internal_actions/servers/statuspage/client";
import {
  renderComponentsList,
  renderIncidentDetails,
  renderIncidentsList,
  renderPagesList,
} from "@app/lib/actions/mcp_internal_actions/servers/statuspage/rendering";
import type { ComponentStatus } from "@app/lib/actions/mcp_internal_actions/servers/statuspage/types";
import {
  ComponentStatusSchema,
  IncidentImpactSchema,
  RealTimeIncidentStatusSchema,
} from "@app/lib/actions/mcp_internal_actions/servers/statuspage/types";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("statuspage");

  // Tool: list_pages
  server.tool(
    "list_pages",
    "List all status pages accessible with the configured API key. " +
      "Use this to discover available page IDs before using other tools.",
    {},
    withToolLogging(
      auth,
      { toolNameForMonitoring: "statuspage_list_pages", agentLoopContext },
      async () => {
        const clientResult = await getStatuspageClient(auth, agentLoopContext);
        if (clientResult.isErr()) {
          return clientResult;
        }

        const client = clientResult.value;
        const result = await client.listPages();

        if (result.isErr()) {
          return new Err(
            new MCPError(`Failed to list pages: ${result.error.message}`)
          );
        }

        const pages = result.value;
        const renderedText = renderPagesList(pages);

        return new Ok([
          {
            type: "text" as const,
            text: renderedText,
          },
        ]);
      }
    )
  );

  // Tool: list_components
  server.tool(
    "list_components",
    "List all components for a status page. " +
      "Components represent the services or systems displayed on the status page.",
    {
      page_id: z
        .string()
        .describe(
          "The ID of the status page. Use list_pages to find available page IDs."
        ),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "statuspage_list_components", agentLoopContext },
      async ({ page_id }) => {
        const clientResult = await getStatuspageClient(auth, agentLoopContext);
        if (clientResult.isErr()) {
          return clientResult;
        }

        const client = clientResult.value;
        const result = await client.listComponents(page_id);

        if (result.isErr()) {
          return new Err(
            new MCPError(`Failed to list components: ${result.error.message}`)
          );
        }

        const components = result.value;
        const renderedText = renderComponentsList(components);

        return new Ok([
          {
            type: "text" as const,
            text: renderedText,
          },
        ]);
      }
    )
  );

  // Tool: list_incidents
  server.tool(
    "list_incidents",
    "List incidents for a status page. " +
      "By default, returns unresolved incidents. " +
      "Use the filter parameter to get all or resolved incidents.",
    {
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
    withToolLogging(
      auth,
      { toolNameForMonitoring: "statuspage_list_incidents", agentLoopContext },
      async ({ page_id, filter }) => {
        const clientResult = await getStatuspageClient(auth, agentLoopContext);
        if (clientResult.isErr()) {
          return clientResult;
        }

        const client = clientResult.value;
        const result = await client.listIncidents(page_id, filter);

        if (result.isErr()) {
          return new Err(
            new MCPError(`Failed to list incidents: ${result.error.message}`)
          );
        }

        const incidents = result.value;
        const renderedText = renderIncidentsList(incidents);

        return new Ok([
          {
            type: "text" as const,
            text: renderedText,
          },
        ]);
      }
    )
  );

  // Tool: get_incident
  server.tool(
    "get_incident",
    "Get detailed information about a specific incident, " +
      "including the full update history and affected components.",
    {
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
    withToolLogging(
      auth,
      { toolNameForMonitoring: "statuspage_get_incident", agentLoopContext },
      async ({ page_id, incident_id }) => {
        const clientResult = await getStatuspageClient(auth, agentLoopContext);
        if (clientResult.isErr()) {
          return clientResult;
        }

        const client = clientResult.value;
        const result = await client.getIncident(page_id, incident_id);

        if (result.isErr()) {
          return new Err(
            new MCPError(`Failed to get incident: ${result.error.message}`)
          );
        }

        const incident = result.value;
        const renderedText = renderIncidentDetails(incident);

        return new Ok([
          {
            type: "text" as const,
            text: renderedText,
          },
        ]);
      }
    )
  );

  // Tool: create_incident
  server.tool(
    "create_incident",
    "Create a new real-time incident on a status page. " +
      "Notifications will automatically be sent to subscribers. " +
      "Use list_components to get component IDs if you want to mark specific components as affected.",
    {
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
    withToolLogging(
      auth,
      { toolNameForMonitoring: "statuspage_create_incident", agentLoopContext },
      async ({
        page_id,
        name,
        status,
        body,
        component_ids,
        component_status,
        impact_override,
      }) => {
        const clientResult = await getStatuspageClient(auth, agentLoopContext);
        if (clientResult.isErr()) {
          return clientResult;
        }

        const client = clientResult.value;

        // Build the component status map if both component_ids and component_status are provided
        let components: Record<string, ComponentStatus> | undefined;
        if (component_ids && component_ids.length > 0 && component_status) {
          components = {};
          for (const componentId of component_ids) {
            components[componentId] = component_status;
          }
        }

        const result = await client.createIncident(page_id, {
          incident: {
            name,
            status,
            body,
            component_ids,
            components,
            impact_override,
          },
        });

        if (result.isErr()) {
          return new Err(
            new MCPError(`Failed to create incident: ${result.error.message}`)
          );
        }

        const incident = result.value;

        return new Ok([
          {
            type: "text" as const,
            text:
              `Successfully created incident "${incident.name}".\n\n` +
              `- ID: ${incident.id}\n` +
              `- Status: ${incident.status}\n` +
              (incident.shortlink ? `- Link: ${incident.shortlink}\n` : "") +
              "\nNotifications have been sent to subscribers.",
          },
        ]);
      }
    )
  );

  // Tool: update_incident
  server.tool(
    "update_incident",
    "Update an existing incident on a status page. " +
      "Notifications will automatically be sent to subscribers. " +
      "Use this to post status updates, change the incident status, or update affected components.",
    {
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
    withToolLogging(
      auth,
      { toolNameForMonitoring: "statuspage_update_incident", agentLoopContext },
      async ({
        page_id,
        incident_id,
        status,
        body,
        component_ids,
        component_status,
      }) => {
        const clientResult = await getStatuspageClient(auth, agentLoopContext);
        if (clientResult.isErr()) {
          return clientResult;
        }

        const client = clientResult.value;

        // Build the component status map if both component_ids and component_status are provided
        let components: Record<string, ComponentStatus> | undefined;
        if (component_ids && component_ids.length > 0 && component_status) {
          components = {};
          for (const componentId of component_ids) {
            components[componentId] = component_status;
          }
        }

        const result = await client.updateIncident(page_id, incident_id, {
          incident: {
            status,
            body,
            component_ids,
            components,
          },
        });

        if (result.isErr()) {
          return new Err(
            new MCPError(`Failed to update incident: ${result.error.message}`)
          );
        }

        const incident = result.value;

        return new Ok([
          {
            type: "text" as const,
            text:
              `Successfully updated incident "${incident.name}".\n\n` +
              `- ID: ${incident.id}\n` +
              `- Status: ${incident.status}\n` +
              (incident.shortlink ? `- Link: ${incident.shortlink}\n` : "") +
              "\nNotifications have been sent to subscribers.",
          },
        ]);
      }
    )
  );

  return server;
}

export default createServer;
