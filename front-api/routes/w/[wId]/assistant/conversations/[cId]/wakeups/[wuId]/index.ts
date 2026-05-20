import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { WakeUpResource } from "@app/lib/resources/wakeup_resource";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

// Mounted at /api/w/:wId/assistant/conversations/:cId/wakeups/:wuId.
const app = new Hono();

app.delete("/", async (ctx) => {
  const auth = ctx.get("auth");
  const cId = ctx.req.param("cId") ?? "";
  const wuId = ctx.req.param("wuId") ?? "";

  // The fetchConversationWithoutContent method checks for conversation
  // accessibility (inside the resource through `baseFetchWithAuthorization`).
  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(auth, cId);
  if (conversationRes.isErr()) {
    return apiErrorForConversation(ctx, conversationRes.error);
  }
  const conversation = conversationRes.value;

  const wakeUp = await WakeUpResource.fetchById(auth, wuId);
  if (!wakeUp || wakeUp.conversationId !== conversation.id) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "wakeup_not_found",
        message: "Wake-up not found in this conversation.",
      },
    });
  }

  const cancelRes = await wakeUp.cancel(auth);
  if (cancelRes.isErr()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: cancelRes.error.message,
      },
    });
  }

  return ctx.json({ wakeUp: wakeUp.toJSON() });
});

export default app;
