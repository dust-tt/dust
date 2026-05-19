import { Hono } from "hono";

import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { getConversationApiError } from "@app/lib/api/assistant/conversation/helper";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";

import { jsonApiError } from "@front-api/middleware/utils";

// Mounted at /api/w/:wId/assistant/conversations/:cId/attachments.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const conversationId = c.req.param("cId") ?? "";

  const conversationRes = await getConversation(auth, conversationId);
  if (conversationRes.isErr()) {
    return jsonApiError(c, getConversationApiError(conversationRes.error));
  }

  const attachments = await listAttachments(auth, {
    conversation: conversationRes.value,
  });

  return c.json({ attachments });
});

export default app;
