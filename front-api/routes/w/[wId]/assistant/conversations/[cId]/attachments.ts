import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import type { GetConversationAttachmentsResponseBody } from "@app/types/api/assistant/conversation/attachments";
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

    const conversationRes = await getConversation(auth, conversationId);
    if (conversationRes.isErr()) {
      return apiErrorForConversation(ctx, conversationRes.error);
    }

    const attachments = await listAttachments(auth, {
      conversation: conversationRes.value,
    });

    return ctx.json({ attachments });
  }
);

export default app;
