import { gracefullyStopAgentLoop } from "@app/lib/api/assistant/pubsub";
import { terminateMessageGeneration } from "@app/lib/api/cancel";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { streamingTag } from "@front-api/middleware/streaming";
import type { HandlerResult } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

export type PostMessageEventResponseBody = {
  success: true;
};

const PostMessageEventBodySchema = z.object({
  action: z.enum(["cancel", "gracefully_stop", "interrupt"]),
  messageIds: z.array(z.string()),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/cancel.
const app = new Hono();

app.use("*", streamingTag);

app.post(
  "/",
  validate("json", PostMessageEventBodySchema),
  async (ctx): HandlerResult<PostMessageEventResponseBody> => {
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

    const { action, messageIds } = ctx.req.valid("json");

    switch (action) {
      case "cancel":
      case "interrupt":
        await terminateMessageGeneration(auth, {
          messageIds,
          conversationId,
          action,
        });
        break;
      case "gracefully_stop":
        await gracefullyStopAgentLoop(auth, {
          messageIds,
          conversationId,
        });
        break;
      default:
        assertNever(action);
    }

    return ctx.json({ success: true });
  }
);

export default app;
