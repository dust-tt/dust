import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { WakeUpResource } from "@app/lib/resources/wakeup_resource";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { Hono } from "hono";

import wakeup from "./[wuId]";

// Mounted at /api/w/:wId/assistant/conversations/:cId/wakeups.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const cId = c.req.param("cId") ?? "";

  // The fetchConversationWithoutContent method checks for conversation
  // accessibility (inside the resource through `baseFetchWithAuthorization`).
  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(auth, cId);
  if (conversationRes.isErr()) {
    return apiErrorForConversation(c, conversationRes.error);
  }
  const conversation = conversationRes.value;

  const wakeUps = await WakeUpResource.listByConversation(auth, conversation);
  return c.json({ wakeUps: wakeUps.map((w) => w.toJSON()) });
});

app.route("/:wuId", wakeup);

export default app;
