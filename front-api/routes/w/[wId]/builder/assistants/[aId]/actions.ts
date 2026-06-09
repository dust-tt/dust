import type { GetActionsResponseBody } from "@app/lib/agent_builder/server_side_props_helpers";
import {
  buildInitialActions,
  getAccessibleSourcesAndAppsForActions,
} from "@app/lib/agent_builder/server_side_props_helpers";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  aId: z.string(),
});

// Mounted at /api/w/:wId/builder/assistants/:aId/actions.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetActionsResponseBody> => {
    const auth = ctx.get("auth");
    const { aId } = ctx.req.valid("param");

    try {
      const agentConfiguration = await getAgentConfiguration(auth, {
        agentId: aId,
        variant: "full",
      });
      if (!agentConfiguration) {
        return apiError(ctx, {
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

      return ctx.json({ actions });
    } catch {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to fetch builder state.",
        },
      });
    }
  }
);

export default app;
