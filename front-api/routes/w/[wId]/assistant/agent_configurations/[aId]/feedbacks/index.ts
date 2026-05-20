import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getAgentFeedbacks } from "@app/lib/api/assistant/feedback";
import { getPaginationParams } from "@app/lib/api/pagination";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

import fId from "./[fId]";

// Mounted under /api/w/:wId/assistant/agent_configurations/:aId/feedbacks.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const aId = c.req.param("aId") ?? "";

  // IMPORTANT: make sure the agent configuration is accessible by the user.
  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "light",
  });
  if (!agentConfiguration) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration was not found.",
      },
    });
  }

  // asc id is equivalent to desc createdAt
  const paginationRes = getPaginationParams(c.req.query(), {
    defaultLimit: 50,
    defaultOrderColumn: "id",
    defaultOrderDirection: "asc",
    supportedOrderColumn: ["id"],
  });
  if (paginationRes.isErr()) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_pagination_parameters",
        message: "Invalid pagination parameters",
      },
    });
  }

  const filterParam = c.req.query("filter");
  const versionParam = c.req.query("version");
  const daysParam = c.req.query("days");
  const filter = filterParam === "all" ? "all" : "active";
  const version = versionParam ? parseInt(versionParam, 10) : undefined;
  const days = daysParam ? parseInt(daysParam, 10) : undefined;

  const feedbacksRes = await getAgentFeedbacks({
    auth,
    agentConfigurationId: aId,
    withMetadata: c.req.query("withMetadata") === "true",
    paginationParams: paginationRes.value,
    filter,
    version: Number.isNaN(version) ? undefined : version,
    days: Number.isNaN(days) ? undefined : days,
  });

  if (feedbacksRes.isErr()) {
    return apiErrorForConversation(c, feedbacksRes.error);
  }

  return c.json({ feedbacks: feedbacksRes.value });
});

app.route("/:fId", fId);

export default app;
