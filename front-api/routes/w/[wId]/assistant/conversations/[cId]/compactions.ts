import { compactConversation } from "@app/lib/api/assistant/conversation/compaction";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { isProviderWhitelisted } from "@app/lib/assistant";
import { isSupportedModel } from "@app/types/assistant/assistant";
import type { CompactionMessageType } from "@app/types/assistant/conversation";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type PostConversationCompactResponseBody = {
  compactionMessage: CompactionMessageType;
};

const PostConversationCompactionsBodySchema = z.object({
  model: z.object({
    providerId: z.string(),
    modelId: z.string(),
  }),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/compactions.
const app = workspaceApp();

app.post(
  "/",
  validate("json", PostConversationCompactionsBodySchema),
  async (ctx): HandlerResult<PostConversationCompactResponseBody> => {
    const auth = ctx.get("auth");
    const conversationId = ctx.req.param("cId") ?? "";

    const conversationRes = await getConversation(auth, conversationId);
    if (conversationRes.isErr()) {
      return apiErrorForConversation(ctx, conversationRes.error);
    }

    const { model } = ctx.req.valid("json");
    if (!isSupportedModel(model)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Unsupported model: ${model.providerId}/${model.modelId}.`,
        },
      });
    }

    if (!isProviderWhitelisted(auth, model.providerId)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "model_disabled",
          message: `The model provider ${model.providerId} has been disabled by your workspace admin.`,
        },
      });
    }

    const result = await compactConversation(auth, {
      conversation: conversationRes.value,
      model,
    });
    if (result.isErr()) {
      return apiError(ctx, result.error);
    }

    return ctx.json({ compactionMessage: result.value.compactionMessage });
  }
);

export default app;
