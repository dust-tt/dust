import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import {
  fetchToolLatencyMetrics,
  fetchToolLatencyMetricsByName,
} from "@app/lib/api/assistant/observability/tool_latency";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
  version: z.string().optional(),
  view: z.enum(["server", "tool"]).optional(),
  serverName: z.string().optional(),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/observability/tool-latency.
const app = new Hono();

app.get("/", validate("query", QuerySchema), async (c) => {
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

  const { days, version, view, serverName } = c.req.valid("query");
  const owner = auth.getNonNullableWorkspace();

  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: owner.sId,
    agentId: assistant.sId,
    days,
    version,
  });

  if (view) {
    if (view === "tool" && !serverName) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "serverName is required when view is tool.",
        },
      });
    }

    const toolLatencyResult = await fetchToolLatencyMetricsByName(
      auth,
      baseQuery,
      { view, serverName }
    );
    if (toolLatencyResult.isErr()) {
      return apiError(c, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to retrieve tool latency metrics: ${fromError(toolLatencyResult.error).toString()}`,
        },
      });
    }

    return c.json({
      byVersion: [],
      rows: toolLatencyResult.value,
      view,
      serverName,
    });
  }

  const toolLatencyResult = await fetchToolLatencyMetrics(baseQuery);
  if (toolLatencyResult.isErr()) {
    return apiError(c, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to retrieve tool latency metrics: ${fromError(toolLatencyResult.error).toString()}`,
      },
    });
  }

  return c.json({ byVersion: toolLatencyResult.value });
});

export default app;
