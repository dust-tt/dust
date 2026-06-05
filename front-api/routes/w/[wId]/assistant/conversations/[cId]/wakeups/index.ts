import type { GetConversationWakeUpsResponseBody } from "@app/lib/api/assistant/conversation/wakeups";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { WakeUpResource } from "@app/lib/resources/wakeup_resource";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import wakeup from "./[wuId]";

const ParamsSchema = z.object({
  cId: z.string(),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/wakeups.
const app = workspaceApp();

app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetConversationWakeUpsResponseBody> => {
    const auth = ctx.get("auth");
    const { cId } = ctx.req.valid("param");

    // The fetchConversationWithoutContent method checks for conversation
    // accessibility (inside the resource through `baseFetchWithAuthorization`).
    const conversationRes =
      await ConversationResource.fetchConversationWithoutContent(auth, cId);
    if (conversationRes.isErr()) {
      return apiErrorForConversation(ctx, conversationRes.error);
    }
    const conversation = conversationRes.value;

    const wakeUps = await WakeUpResource.listByConversation(auth, conversation);
    return ctx.json({ wakeUps: wakeUps.map((w) => w.toJSON()) });
  }
);

app.route("/:wuId", wakeup);

export default app;
