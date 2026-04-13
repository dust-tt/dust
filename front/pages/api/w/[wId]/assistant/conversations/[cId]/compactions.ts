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
import { compactConversation } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import { isSupportedModel } from "@app/types/assistant/assistant";
import type { CompactionMessageType } from "@app/types/assistant/conversation";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const PostConversationCompactionsBodySchema = z.object({
  model: z.object({
    providerId: z.string(),
    modelId: z.string(),
  }),
});

export type PostConversationCompactResponseBody = {
  compactionMessage: CompactionMessageType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PostConversationCompactResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const { cId } = req.query;
  if (typeof cId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid conversation ID.",
      },
    });
  }

  const conversationRes = await getConversation(auth, cId);
  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  switch (req.method) {
    case "POST": {
      const bodyValidation = PostConversationCompactionsBodySchema.safeParse(
        req.body
      );
      if (!bodyValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${fromError(bodyValidation.error).message}`,
          },
        });
      }

      const { model } = bodyValidation.data;
      if (!isSupportedModel(model)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Unsupported model: ${model.providerId}/${model.modelId}.`,
          },
        });
      }

      const result = await compactConversation(auth, {
        conversation: conversationRes.value,
        model,
      });
      if (result.isErr()) {
        return apiError(req, res, {
          status_code: result.error.status_code,
          api_error: result.error.api_error,
        });
      }

      return res.status(200).json({
        compactionMessage: result.value.compactionMessage,
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
