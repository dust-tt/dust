import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import type { GetAgentOverviewResponseBody } from "@app/types/api/assistant/observability/overview";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

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

    const { days } = ctx.req.valid("query");

    const feedbackCounts =
      await AgentMessageFeedbackResource.getFeedbackCountForAssistant(
        auth,
        assistant.sId,
        days
      );

    return ctx.json({
      feedbacks: {
        positiveFeedbacks: feedbackCounts.positive,
        negativeFeedbacks: feedbackCounts.negative,
        timePeriodSec: days * 24 * 60 * 60,
      },
    });
  }
);

export default app;
