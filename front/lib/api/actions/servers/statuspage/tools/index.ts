import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { StatuspageClient } from "@app/lib/api/actions/servers/statuspage/client";
import { getStatuspageClient } from "@app/lib/api/actions/servers/statuspage/client";
import { STATUSPAGE_TOOLS_METADATA } from "@app/lib/api/actions/servers/statuspage/metadata";
import {
  renderComponentsList,
  renderIncidentDetails,
  renderIncidentsList,
  renderPagesList,
} from "@app/lib/api/actions/servers/statuspage/rendering";
import type { ComponentStatus } from "@app/lib/api/actions/servers/statuspage/types";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types/shared/result";

async function withClient(
  auth: Authenticator,
  agentLoopContext: AgentLoopContextType | undefined,
  action: (client: StatuspageClient) => Promise<ToolHandlerResult>
): Promise<ToolHandlerResult> {
  const clientResult = await getStatuspageClient(auth, agentLoopContext);
  if (clientResult.isErr()) {
    return clientResult;
  }
  return action(clientResult.value);
}

export function createStatuspageTools(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
) {
  const handlers: ToolHandlers<typeof STATUSPAGE_TOOLS_METADATA> = {
    // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
    list_pages: async (_params, _extra: ToolHandlerExtra) => {
      return withClient(auth, agentLoopContext, async (client) => {
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
      });
    },

    // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
    list_components: async ({ page_id }, _extra: ToolHandlerExtra) => {
      return withClient(auth, agentLoopContext, async (client) => {
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
      });
    },

    // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
    list_incidents: async ({ page_id, filter }, _extra: ToolHandlerExtra) => {
      return withClient(auth, agentLoopContext, async (client) => {
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
      });
    },

    // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
    get_incident: async (
      { page_id, incident_id },
      _extra: ToolHandlerExtra
    ) => {
      return withClient(auth, agentLoopContext, async (client) => {
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
      });
    },

    // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
    create_incident: async (
      {
        page_id,
        name,
        status,
        body,
        component_ids,
        component_status,
        impact_override,
      },
      _extra: ToolHandlerExtra
    ) => {
      return withClient(auth, agentLoopContext, async (client) => {
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
      });
    },

    // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
    update_incident: async (
      { page_id, incident_id, status, body, component_ids, component_status },
      _extra: ToolHandlerExtra
    ) => {
      return withClient(auth, agentLoopContext, async (client) => {
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
      });
    },
  };

  return buildTools(STATUSPAGE_TOOLS_METADATA, handlers);
}
