import { terminateMessageGeneration } from "@app/lib/api/cancel";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import {
  CancelMessageGenerationRequestSchema,
  type CancelMessageGenerationResponseType,
} from "@dust-tt/client";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { streamingTag } from "@front-api/middlewares/streaming";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
});

// Mounted at /api/v1/w/:wId/assistant/conversations/:cId/cancel.
const app = publicApiApp();

app.use("*", streamingTag);

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/conversations/{cId}/cancel:
 *   post:
 *     tags:
 *       - Conversations
 *     summary: Cancel message generation in a conversation
 *     parameters:
 *       - name: wId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Workspace ID
 *       - name: cId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation ID
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - messageIds
 *             properties:
 *               messageIds:
 *                 type: array
 *                 description: List of message IDs to cancel generation for
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Message generation successfully canceled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates if the cancellation was successful
 *       400:
 *         description: Invalid request (invalid query parameters or request body)
 *       405:
 *         description: Method not supported
 */
app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", CancelMessageGenerationRequestSchema),
  async (ctx): HandlerResult<CancelMessageGenerationResponseType> => {
    const auth = ctx.get("auth");
    const { cId: conversationId } = ctx.req.valid("param");

    const conversationRes =
      await ConversationResource.fetchConversationWithoutContent(
        auth,
        conversationId
      );

    if (conversationRes.isErr()) {
      return apiErrorForConversation(ctx, conversationRes.error);
    }

    const { messageIds } = ctx.req.valid("json");

    await terminateMessageGeneration(auth, {
      messageIds,
      conversationId,
      action: "cancel",
    });
    return ctx.json({ success: true });
  }
);

export default app;
