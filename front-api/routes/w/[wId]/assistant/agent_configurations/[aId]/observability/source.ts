import { Hono } from "hono";
import { z } from "zod";
import { fromError } from "zod-validation-error";

import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { fetchContextOriginBreakdown } from "@app/lib/api/assistant/observability/context_origin";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";

import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
  version: z.string().optional(),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/observability/source.
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

  const { days, version } = c.req.valid("query");
  const owner = auth.getNonNullableWorkspace();

  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: owner.sId,
    agentId: assistant.sId,
    days,
    version,
  });

  const result = await fetchContextOriginBreakdown(baseQuery);
  if (result.isErr()) {
    return apiError(c, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to retrieve source breakdown: ${fromError(result.error).toString()}`,
      },
    });
  }

  const buckets = result.value;
  const total = buckets.reduce((acc, b) => acc + b.count, 0);

  return c.json({ total, buckets });
});

export default app;
