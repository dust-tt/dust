import { compactConversation } from "@app/lib/api/assistant/conversation/compaction";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { isProviderWhitelisted } from "@app/lib/api/assistant/models";
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

const ParamsSchema = z.object({
  cId: z.string(),
});

const PostConversationCompactionsBodySchema = z.object({
  model: z.object({
    providerId: z.string(),
    modelId: z.string(),
  }),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/compactions.
const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/assistant/conversations/{cId}/compactions:
 *   post:
 *     summary: Compact a conversation
 *     description: Trigger compaction of a conversation, summarizing older messages into a compaction message. Requires a model to use for summary generation.
 *     tags:
 *       - Private Conversations
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: cId
 *         required: true
 *         description: ID of the conversation
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - model
 *             properties:
 *               model:
 *                 type: object
 *                 required:
 *                   - providerId
 *                   - modelId
 *                 properties:
 *                   providerId:
 *                     type: string
 *                   modelId:
 *                     type: string
 *     responses:
 *       200:
 *         description: Compaction started
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 compactionMessage:
 *                   $ref: '#/components/schemas/PrivateCompactionMessage'
 *       409:
 *         description: Conflict — compaction or agent message is already running
 *       404:
 *         description: Conversation not found
 *       400:
 *         description: Invalid request body
 */

app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", PostConversationCompactionsBodySchema),
  async (ctx): HandlerResult<PostConversationCompactResponseBody> => {
    const auth = ctx.get("auth");
    const { cId: conversationId } = ctx.req.valid("param");

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
