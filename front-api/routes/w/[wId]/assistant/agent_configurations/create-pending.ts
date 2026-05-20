import { createPendingAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type PostPendingAgentResponseBody = {
  sId: string;
};

// Mounted at /api/w/:wId/assistant/agent_configurations/create-pending.
const app = new Hono();

app.post("/", async (ctx): HandlerResult<PostPendingAgentResponseBody> => {
  const auth = ctx.get("auth");

  if (!auth.user()) {
    return apiError(ctx, {
      status_code: 401,
      api_error: {
        type: "not_authenticated",
        message: "You must be authenticated to create a pending agent.",
      },
    });
  }

  const { sId } = await createPendingAgentConfiguration(auth);
  return ctx.json({ sId });
});

export default app;
