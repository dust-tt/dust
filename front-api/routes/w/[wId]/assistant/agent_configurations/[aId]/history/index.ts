import {
  getAgentConfiguration,
  listsAgentConfigurationVersions,
} from "@app/lib/api/assistant/configuration/agent";
import { GetAgentConfigurationsHistoryQuerySchema } from "@app/types/api/internal/agent_configuration";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { fromError } from "zod-validation-error";

export type GetAgentConfigurationsResponseBody = {
  history: LightAgentConfigurationType[];
};

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/history.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetAgentConfigurationsResponseBody> => {
  const auth = ctx.get("auth");
  const aId = ctx.req.param("aId") ?? "";

  const assistant = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "light",
  });
  if (!assistant || (!assistant.canRead && !auth.isAdmin())) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent you're trying to access was not found.",
      },
    });
  }

  // The schema expects `limit` as a number; query params arrive as strings,
  // so we parseInt before validation (matches the Next-side handler).
  const queryRaw = ctx.req.query();
  const queryValidation = GetAgentConfigurationsHistoryQuerySchema.safeParse({
    ...queryRaw,
    limit:
      typeof queryRaw.limit === "string"
        ? parseInt(queryRaw.limit, 10)
        : undefined,
  });
  if (!queryValidation.success) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid query parameters: ${fromError(queryValidation.error).toString()}`,
      },
    });
  }

  const { limit } = queryValidation.data;

  let agentConfigurations = await listsAgentConfigurationVersions(auth, {
    agentId: aId,
    variant: "light",
  });

  if (limit) {
    agentConfigurations = agentConfigurations.slice(0, limit);
  }

  if (!agentConfigurations || !agentConfigurations[0].canRead) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent you're trying to access was not found.",
      },
    });
  }

  return ctx.json({ history: agentConfigurations });
});

export default app;
