import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { Hono } from "hono";

// Mounted at /api/w/:wId/assistant/conversations/:cId/attachments.
const app = new Hono();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");
  const conversationId = ctx.req.param("cId") ?? "";

  const conversationRes = await getConversation(auth, conversationId);
  if (conversationRes.isErr()) {
    return apiErrorForConversation(ctx, conversationRes.error);
  }

  const attachments = await listAttachments(auth, {
    conversation: conversationRes.value,
  });

  return ctx.json({ attachments });
});

export default app;
