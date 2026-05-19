import { Hono } from "hono";
import { z } from "zod";

import { gracefullyStopAgentLoop } from "@app/lib/api/assistant/pubsub";
import { terminateMessageGeneration } from "@app/lib/api/cancel";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { assertNever } from "@app/types/shared/utils/assert_never";

import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { validate } from "@front-api/middleware/validator";

const PostMessageEventBodySchema = z.object({
  action: z.enum(["cancel", "gracefully_stop", "interrupt"]),
  messageIds: z.array(z.string()),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/cancel.
const app = new Hono();

app.post("/", validate("json", PostMessageEventBodySchema), async (c) => {
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

  const { action, messageIds } = c.req.valid("json");

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

  return c.json({ success: true });
});

export default app;
