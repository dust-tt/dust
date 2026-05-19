import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";

import { buildShrinkWrapPromptForConversation } from "@app/lib/api/assistant/builder/sidekick_prompts";

import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";

// Mounted at /api/w/:wId/assistant/builder/sidekick/prompt/shrink-wrap.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const conversationId = c.req.query("conversationId");
  if (!conversationId) {
    return apiError(c, {
      status_code: 422,
      api_error: {
        type: "unprocessable_entity",
        message: "The conversationId query parameter is invalid or missing.",
      },
    });
  }

  const result = await buildShrinkWrapPromptForConversation(
    auth,
    conversationId
  );
  if (result.isErr()) {
    return apiErrorForConversation(c, result.error);
  }
  return c.json(result.value);
});

export default app;
