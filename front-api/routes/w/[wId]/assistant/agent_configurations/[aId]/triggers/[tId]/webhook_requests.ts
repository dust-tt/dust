import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { fetchRecentWebhookRequestTriggersWithPayload } from "@app/lib/triggers/webhook";
import logger from "@app/logger/logger";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/triggers/:tId/webhook_requests.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const aId = c.req.param("aId") ?? "";
  const tId = c.req.param("tId") ?? "";

  const trigger = await TriggerResource.fetchById(auth, tId);
  if (!trigger) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "trigger_not_found",
        message: "Trigger not found.",
      },
    });
  }

  if (trigger.agentConfigurationId !== aId) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Trigger does not belong to the specified agent configuration.",
      },
    });
  }

  try {
    const r = await fetchRecentWebhookRequestTriggersWithPayload(auth, {
      trigger: trigger.toJSON(),
      limit: 15,
    });
    return c.json({ requests: r });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        aId,
        tId,
      },
      "Error fetching webhook requests"
    );
    return apiError(c, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to fetch webhook requests.",
      },
    });
  }
});

export default app;
