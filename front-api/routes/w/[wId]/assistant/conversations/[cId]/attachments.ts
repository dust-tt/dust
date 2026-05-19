import { Hono } from "hono";

import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";

import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";

// Mounted at /api/w/:wId/assistant/conversations/:cId/attachments.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const conversationId = c.req.param("cId") ?? "";

  const conversationRes = await getConversation(auth, conversationId);
  if (conversationRes.isErr()) {
    return apiErrorForConversation(c, conversationRes.error);
  }

  const attachments = await listAttachments(auth, {
    conversation: conversationRes.value,
  });

  return c.json({ attachments });
});

export default app;
