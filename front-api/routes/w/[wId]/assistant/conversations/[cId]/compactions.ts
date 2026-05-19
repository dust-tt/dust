import { Hono } from "hono";
import { z } from "zod";

import { compactConversation } from "@app/lib/api/assistant/conversation/compaction";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { isProviderWhitelisted } from "@app/lib/assistant";
import { isSupportedModel } from "@app/types/assistant/assistant";

import { apiError } from "@front-api/middleware/utils";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { validate } from "@front-api/middleware/validator";

const PostConversationCompactionsBodySchema = z.object({
  model: z.object({
    providerId: z.string(),
    modelId: z.string(),
  }),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/compactions.
const app = new Hono();

app.post(
  "/",
  validate("json", PostConversationCompactionsBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const conversationId = c.req.param("cId") ?? "";

    const conversationRes = await getConversation(auth, conversationId);
    if (conversationRes.isErr()) {
      return apiErrorForConversation(c, conversationRes.error);
    }

    const { model } = c.req.valid("json");
    if (!isSupportedModel(model)) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Unsupported model: ${model.providerId}/${model.modelId}.`,
        },
      });
    }

    if (!isProviderWhitelisted(auth, model.providerId)) {
      return apiError(c, {
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
      return apiError(c, result.error);
    }

    return c.json({ compactionMessage: result.value.compactionMessage });
  }
);

export default app;
