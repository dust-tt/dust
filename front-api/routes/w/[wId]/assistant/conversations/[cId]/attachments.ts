import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { GetConversationAttachmentsResponseBody } from "@app/types/api/assistant/conversation/attachments";
import { ConversationError } from "@app/types/assistant/conversation";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/attachments.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetConversationAttachmentsResponseBody> => {
    const auth = ctx.get("auth");
    const { cId: conversationId } = ctx.req.valid("param");

    const conversation = await ConversationResource.fetchById(
      auth,
      conversationId
    );
    if (!conversation) {
      return apiErrorForConversation(
        ctx,
        new ConversationError("conversation_not_found")
      );
    }

    const attachments = await listAttachments(auth, {
      conversation,
    });

    return ctx.json({ attachments });
  }
);

export default app;
