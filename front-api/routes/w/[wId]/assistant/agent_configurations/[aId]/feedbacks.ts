import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getAgentFeedbacks } from "@app/lib/api/assistant/feedback";
import { getPaginationParams } from "@app/lib/api/pagination";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";

import fId from "./feedbacks/[fId]";

// Mounted under /api/w/:wId/assistant/agent_configurations/:aId/feedbacks.
const app = workspaceApp();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");
  const aId = ctx.req.param("aId") ?? "";

  // IMPORTANT: make sure the agent configuration is accessible by the user.
  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "light",
  });
  if (!agentConfiguration) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration was not found.",
      },
    });
  }

  // asc id is equivalent to desc createdAt
  const paginationRes = getPaginationParams(ctx.req.query(), {
    defaultLimit: 50,
    defaultOrderColumn: "id",
    defaultOrderDirection: "asc",
    supportedOrderColumn: ["id"],
  });
  if (paginationRes.isErr()) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_pagination_parameters",
        message: "Invalid pagination parameters",
      },
    });
  }

  const filterParam = ctx.req.query("filter");
  const versionParam = ctx.req.query("version");
  const daysParam = ctx.req.query("days");
  const filter = filterParam === "all" ? "all" : "active";
  const version = versionParam ? parseInt(versionParam, 10) : undefined;
  const days = daysParam ? parseInt(daysParam, 10) : undefined;

  const feedbacksRes = await getAgentFeedbacks({
    auth,
    agentConfigurationId: aId,
    withMetadata: ctx.req.query("withMetadata") === "true",
    paginationParams: paginationRes.value,
    filter,
    version: Number.isNaN(version) ? undefined : version,
    days: Number.isNaN(days) ? undefined : days,
  });

  if (feedbacksRes.isErr()) {
    return apiErrorForConversation(ctx, feedbacksRes.error);
  }

  return ctx.json({ feedbacks: feedbacksRes.value });
});

app.route("/:fId", fId);

export default app;
