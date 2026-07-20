import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  listIncidents,
  renderIncident,
  withAuth,
} from "@app/lib/api/actions/servers/servicenow/helpers";
import { SERVICENOW_TOOLS_METADATA } from "@app/lib/api/actions/servers/servicenow/metadata";
import { Ok } from "@app/types/shared/result";

const handlers: ToolHandlers<typeof SERVICENOW_TOOLS_METADATA> = {
  list_incidents: async ({ query, limit }, { authInfo }) => {
    return withAuth({
      authInfo,
      action: async (accessToken, instanceUrl) => {
        const result = await listIncidents(accessToken, instanceUrl, {
          query,
          limit,
        });

        if (result.isErr()) {
          return result;
        }

        const incidents = result.value;

        if (incidents.length === 0) {
          return new Ok([
            { type: "text" as const, text: "No incidents found." },
          ]);
        }

        let text = `Found ${incidents.length} incident(s):\n\n`;
        for (const incident of incidents) {
          text += renderIncident(incident) + "\n";
        }

        return new Ok([{ type: "text" as const, text }]);
      },
    });
  },
};

export const TOOLS = buildTools(SERVICENOW_TOOLS_METADATA, handlers);
