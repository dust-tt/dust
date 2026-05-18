import { Hono } from "hono";

import { buildShrinkWrapPromptForConversation } from "@app/lib/api/assistant/builder/sidekick_prompts";
import { getConversationApiError } from "@app/lib/api/assistant/conversation/helper";

import { jsonApiError } from "@front-api/middleware/utils";

// Mounted at /api/w/:wId/assistant/builder/sidekick/prompt/shrink-wrap.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const conversationId = c.req.query("conversationId");
  if (!conversationId) {
    return c.json(
      {
        error: {
          type: "unprocessable_entity",
          message: "The conversationId query parameter is invalid or missing.",
        },
      },
      422
    );
  }

  const result = await buildShrinkWrapPromptForConversation(
    auth,
    conversationId
  );
  if (result.isErr()) {
    return jsonApiError(c, getConversationApiError(result.error));
  }
  return c.json(result.value);
});

export default app;
