import { getConversationFeedbacksForUser } from "@app/lib/api/assistant/feedback";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { workspaceApp } from "@front-api/middleware/env";

// Mounted at /api/w/:wId/assistant/conversations/:cId/feedbacks.
const app = workspaceApp();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");
  const conversationId = ctx.req.param("cId") ?? "";

  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(
      auth,
      conversationId
    );
  if (conversationRes.isErr()) {
    return apiErrorForConversation(ctx, conversationRes.error);
  }

  const feedbacksRes = await getConversationFeedbacksForUser(
    auth,
    conversationRes.value
  );
  if (feedbacksRes.isErr()) {
    return apiErrorForConversation(ctx, feedbacksRes.error);
  }

  return ctx.json({ feedbacks: feedbacksRes.value });
});

export default app;
