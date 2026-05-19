import { Hono } from "hono";

import { getConversationApiError } from "@app/lib/api/assistant/conversation/helper";
import { getConversationFeedbacksForUser } from "@app/lib/api/assistant/feedback";
import { ConversationResource } from "@app/lib/resources/conversation_resource";

import { jsonApiError } from "@front-api/middleware/utils";

// Mounted at /api/w/:wId/assistant/conversations/:cId/feedbacks.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const conversationId = c.req.param("cId") ?? "";

  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(
      auth,
      conversationId
    );
  if (conversationRes.isErr()) {
    return jsonApiError(c, getConversationApiError(conversationRes.error));
  }

  const feedbacksRes = await getConversationFeedbacksForUser(
    auth,
    conversationRes.value
  );
  if (feedbacksRes.isErr()) {
    return jsonApiError(c, getConversationApiError(feedbacksRes.error));
  }

  return c.json({ feedbacks: feedbacksRes.value });
});

export default app;
