import {
  getAgentConfiguration,
  listsAgentConfigurationVersions,
} from "@app/lib/api/assistant/configuration/agent";
import { GetAgentConfigurationsHistoryQuerySchema } from "@app/types/api/internal/agent_configuration";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";
import { fromError } from "zod-validation-error";

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/history.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const aId = c.req.param("aId") ?? "";

  const assistant = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "light",
  });
  if (!assistant || (!assistant.canRead && !auth.isAdmin())) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent you're trying to access was not found.",
      },
    });
  }

  // The schema expects `limit` as a number; query params arrive as strings,
  // so we parseInt before validation (matches the Next-side handler).
  const queryRaw = c.req.query();
  const queryValidation = GetAgentConfigurationsHistoryQuerySchema.safeParse({
    ...queryRaw,
    limit:
      typeof queryRaw.limit === "string"
        ? parseInt(queryRaw.limit, 10)
        : undefined,
  });
  if (!queryValidation.success) {
    return apiError(c, {
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
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent you're trying to access was not found.",
      },
    });
  }

  return c.json({ history: agentConfigurations });
});

export default app;
