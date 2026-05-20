import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { fetchAgentOverview } from "@app/lib/api/assistant/observability/overview";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
  version: z.string().optional(),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/observability/overview.
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

  const overview = await fetchAgentOverview(baseQuery, days);
  if (overview.isErr()) {
    return apiError(c, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to retrieve agent overview: ${fromError(overview.error).toString()}`,
      },
    });
  }

  const {
    activeUsers,
    conversationCount,
    messageCount,
    positiveFeedbacks,
    negativeFeedbacks,
  } = overview.value;

  return c.json({
    activeUsers,
    mentions: {
      messageCount,
      conversationCount,
      timePeriodSec: days * 24 * 60 * 60,
    },
    feedbacks: {
      positiveFeedbacks,
      negativeFeedbacks,
      timePeriodSec: days * 24 * 60 * 60,
    },
  });
});

export default app;
