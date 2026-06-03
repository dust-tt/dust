import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import assert from "assert";
import { z } from "zod";

const ParamsSchema = z.object({
  aId: z.string(),
});

export type PokeExportAgentConfigurationResponseBody = {
  assistant: Omit<
    AgentConfigurationType,
    | "id"
    | "versionCreatedAt"
    | "sId"
    | "version"
    | "owner"
    | "workspace"
    | "createdAt"
    | "versionAuthorId"
    | "userFavorite"
    | "requestedGroupIds"
    | "requestedSpaceIds"
    | "actions"
    | "skills"
  > & {
    actions: Omit<MCPServerConfigurationType, "id" | "sId">[];
  };
};

// Mounted at /api/poke/workspaces/:wId/agent_configurations/:aId/export.
const app = pokeApp();

app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<PokeExportAgentConfigurationResponseBody> => {
    const auth = ctx.get("auth");
    const { aId } = ctx.req.valid("param");

    const agentConfiguration = await getAgentConfiguration(auth, {
      agentId: aId,
      variant: "full",
    });
    if (!agentConfiguration) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent configuration you requested was not found.",
        },
      });
    }

    if (
      agentConfiguration.status !== "active" ||
      agentConfiguration.scope === "global"
    ) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "The agent configuration is not active, or has global scope.",
        },
      });
    }

    return ctx.json({
      assistant: {
        name: agentConfiguration.name,
        description: agentConfiguration.description,
        instructions: agentConfiguration.instructions,
        instructionsHtml: agentConfiguration.instructionsHtml,
        pictureUrl: agentConfiguration.pictureUrl,
        status: agentConfiguration.status,
        scope: agentConfiguration.scope,
        model: agentConfiguration.model,
        actions: agentConfiguration.actions.map((action) => {
          assert(
            action.type === "mcp_server_configuration",
            "Legacy action type, non-MCP, are no longer supported."
          );
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { id, sId, ...actionWithoutIds } = action;
          return {
            ...actionWithoutIds,
            ...("dataSources" in action ? { dataSources: [] } : {}),
            ...("tables" in action ? { tables: [] } : {}),
          };
        }),
        templateId: agentConfiguration.templateId,
        maxStepsPerRun: agentConfiguration.maxStepsPerRun,
        tags: agentConfiguration.tags,
        reinforcement: agentConfiguration.reinforcement,
        canRead: agentConfiguration.canRead,
        canEdit: agentConfiguration.canEdit,
        editors: [],
      },
    });
  }
);

export default app;
