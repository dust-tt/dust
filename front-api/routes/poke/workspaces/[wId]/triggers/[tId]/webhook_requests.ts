import { Hono } from "hono";
import { z } from "zod";

import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { fetchRecentWebhookRequestTriggersWithPayload } from "@app/lib/triggers/webhook";
import type { WebhookRequestTriggerStatus } from "@app/types/assistant/triggers";
import { WEBHOOK_REQUEST_TRIGGER_STATUSES } from "@app/types/assistant/triggers";

import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";

export interface PokeGetWebhookRequestsResponseBody {
  requests: {
    id: number;
    timestamp: number;
    status: WebhookRequestTriggerStatus;
    payload?: {
      headers?: Record<string, string | string[]>;
      body?: unknown;
    };
  }[];
}

const WebhookRequestsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
  status: z.enum(WEBHOOK_REQUEST_TRIGGER_STATUSES).optional(),
});

// Mounted at /api/poke/workspaces/:wId/triggers/:tId/webhook_requests.
const app = new Hono();

app.get("/", validate("query", WebhookRequestsQuerySchema), async (c) => {
  const auth = c.get("auth");
  const tId = c.req.param("tId");
  if (!tId) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid trigger ID.",
      },
    });
  }

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

  const { limit, status } = c.req.valid("query");

  const requests = await fetchRecentWebhookRequestTriggersWithPayload(auth, {
    trigger: trigger.toJSON(),
    ...(limit !== undefined ? { limit } : {}),
    status,
  });

  const body: PokeGetWebhookRequestsResponseBody = { requests };
  return c.json(body);
});

export default app;
