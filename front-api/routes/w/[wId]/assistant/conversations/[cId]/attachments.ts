import type { ConversationAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { workspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";

export type GetConversationAttachmentsResponseBody = {
  attachments: ConversationAttachmentType[];
};

// Mounted at /api/w/:wId/assistant/conversations/:cId/attachments.
const app = workspaceApp();

app.get(
  "/",
  async (ctx): HandlerResult<GetConversationAttachmentsResponseBody> => {
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
  }
);

export default app;
