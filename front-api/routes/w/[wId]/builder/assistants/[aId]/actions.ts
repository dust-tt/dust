import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";

import type { AgentBuilderMCPConfiguration } from "@app/components/agent_builder/types";
import {
  buildInitialActions,
  getAccessibleSourcesAndAppsForActions,
} from "@app/lib/agent_builder/server_side_props_helpers";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";

export type GetActionsResponseBody = {
  actions: AgentBuilderMCPConfiguration[];
};

// Mounted at /api/w/:wId/builder/assistants/:aId/actions.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const aId = c.req.param("aId") ?? "";

  try {
    const agentConfiguration = await getAgentConfiguration(auth, {
      agentId: aId,
      variant: "full",
    });
    if (!agentConfiguration) {
      return apiError(c, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "Agent configuration not found.",
        },
      });
    }

    const { dataSourceViews, mcpServerViews } =
      await getAccessibleSourcesAndAppsForActions(auth);
    const mcpServerViewsJSON = mcpServerViews.map((v) => v.toJSON());

    const actions = await buildInitialActions({
      dataSourceViews,
      configuration: agentConfiguration,
      mcpServerViews: mcpServerViewsJSON,
    });

    if (
      agentConfiguration.scope !== "visible" &&
      agentConfiguration.scope !== "hidden"
    ) {
      throw new Error("Invalid agent scope");
    }

    return c.json({ actions });
  } catch {
    return apiError(c, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to fetch builder state.",
      },
    });
  }
});

export default app;
