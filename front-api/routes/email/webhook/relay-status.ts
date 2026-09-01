import type { EmailRelayStatus } from "@app/lib/api/assistant/email/webhook_helpers";
import {
  getEmailRelayId,
  getEmailRelayStatus,
  hasValidRelayAuthorization,
  toEmailWebhookHeaders,
} from "@app/lib/api/assistant/email/webhook_helpers";
import { createHono } from "@front-api/lib/hono";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

type GetResponseBody = {
  status: EmailRelayStatus;
};

const app = createHono();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetResponseBody> => {
  const headers = toEmailWebhookHeaders(ctx.req.raw.headers);
  if (!hasValidRelayAuthorization(headers)) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "invalid_basic_authorization_error",
        message: "Invalid Authorization header",
      },
    });
  }

  const relayId = getEmailRelayId(headers);
  if (!relayId) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing relay ID header",
      },
    });
  }

  return ctx.json({ status: await getEmailRelayStatus(relayId) });
});

export default app;
