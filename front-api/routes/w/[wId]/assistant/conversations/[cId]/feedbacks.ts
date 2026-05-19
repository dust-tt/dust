import { Hono } from "hono";

import { getConversationFeedbacksForUser } from "@app/lib/api/assistant/feedback";
import { ConversationResource } from "@app/lib/resources/conversation_resource";

import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";

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
    return apiErrorForConversation(c, conversationRes.error);
  }

  const feedbacksRes = await getConversationFeedbacksForUser(
    auth,
    conversationRes.value
  );
  if (feedbacksRes.isErr()) {
    return apiErrorForConversation(c, feedbacksRes.error);
  }

  return c.json({ feedbacks: feedbacksRes.value });
});

export default app;
