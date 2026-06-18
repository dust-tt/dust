import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { GetAgentOverviewResponseBody } from "@app/lib/api/assistant/observability/overview";
import {
  fetchAgentCostStats,
  fetchAgentOverview,
  getAgentCostStats,
} from "@app/lib/api/assistant/observability/overview";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const ParamsSchema = z.object({
  aId: z.string(),
});

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
  version: z.string().optional(),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/observability/overview.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  validate("query", QuerySchema),
  async (ctx): HandlerResult<GetAgentOverviewResponseBody> => {
    const auth = ctx.get("auth");
    const { aId } = ctx.req.valid("param");

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

    const { days, version } = ctx.req.valid("query");
    const owner = auth.getNonNullableWorkspace();

    const baseQuery = buildAgentAnalyticsBaseQuery({
      workspaceId: owner.sId,
      agentId: assistant.sId,
      days,
      version,
    });

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [overview, costStatsMap] = await Promise.all([
      fetchAgentOverview(baseQuery, days),
      fetchAgentCostStats(
        owner,
        [assistant.sId],
        cutoff,
        version !== undefined ? Number(version) : undefined
      ),
    ]);
    const costs = getAgentCostStats(costStatsMap, assistant.sId);

    if (overview.isErr()) {
      return apiError(ctx, {
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

    return ctx.json({
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
      costs,
    });
  }
);

export default app;
