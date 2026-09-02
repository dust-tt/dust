import {
  EMAIL_WEBHOOK_RELAY_ID_HEADER,
  hasEmailRelayReceipt,
  hasValidRelayAuthorization,
  toEmailWebhookHeaders,
} from "@app/lib/api/assistant/email/webhook_helpers";
import { createHono } from "@front-api/lib/hono";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

type GetResponseBody = {
  received: boolean;
};

const app = createHono();
const RelayHeadersSchema = z.object({
  [EMAIL_WEBHOOK_RELAY_ID_HEADER]: z.string().uuid(),
});
app.use("/", validate("header", RelayHeadersSchema));

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

  const relayId = ctx.req.valid("header")[EMAIL_WEBHOOK_RELAY_ID_HEADER];
  return ctx.json({ received: await hasEmailRelayReceipt(relayId) });
});

export default app;
