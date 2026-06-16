import { gracefullyStopAgentLoop } from "@app/lib/api/assistant/pubsub";
import { terminateMessageGeneration } from "@app/lib/api/cancel";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { streamingTag } from "@front-api/middlewares/streaming";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { SuccessResponseBody } from "@front-api/routes/types";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
});

const PostMessageEventBodySchema = z.object({
  action: z.enum(["cancel", "gracefully_stop", "interrupt"]),
  messageIds: z.array(z.string()),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/cancel.
const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/assistant/conversations/{cId}/cancel:
 *   post:
 *     summary: Cancel message generation
 *     description: Cancels the generation of messages in a conversation.
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
 *               - action
 *               - messageIds
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [cancel, gracefully_stop, interrupt]
 *               messageIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       401:
 *         description: Unauthorized
 */

app.use("*", streamingTag);

app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", PostMessageEventBodySchema),
  async (ctx): HandlerResult<SuccessResponseBody> => {
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
