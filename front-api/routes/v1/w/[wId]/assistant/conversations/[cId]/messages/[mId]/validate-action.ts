import { validateAction } from "@app/lib/api/assistant/conversation/validate_actions";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import {
  ValidateActionRequestBodySchema,
  type ValidateActionResponseType,
} from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { streamingTag } from "@front-api/middlewares/streaming";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
  mId: z.string(),
});

// Mounted at /api/v1/w/:wId/assistant/conversations/:cId/messages/:mId/validate-action.
const app = publicApiApp();

app.use("*", streamingTag);

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/conversations/{cId}/messages/{mId}/validate-action:
 *   post:
 *     summary: Validate an action in a conversation message
 *     description: Approves or rejects an action taken in a specific message in a conversation
 *     tags:
 *       - Conversations
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         schema:
 *           type: string
 *         description: Workspace ID
 *       - in: path
 *         name: cId
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation ID
 *       - in: path
 *         name: mId
 *         required: true
 *         schema:
 *           type: string
 *         description: Message ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - actionId
 *               - approved
 *             properties:
 *               actionId:
 *                 type: string
 *                 description: ID of the action to validate
 *               approved:
 *                 type: boolean
 *                 description: Whether the action is approved or rejected
 *     responses:
 *       200:
 *         description: Action validation successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: Invalid request body
 *       404:
 *         description: Conversation, message, or workspace not found
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Internal server error
 *     security:
 *       - BearerAuth: []
 */
app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", ValidateActionRequestBodySchema),
  async (ctx): HandlerResult<ValidateActionResponseType> => {
    const auth = ctx.get("auth");
    const { cId, mId } = ctx.req.valid("param");

    const conversation = await ConversationResource.fetchById(auth, cId);

    if (!conversation) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "conversation_not_found",
          message: "Conversation not found.",
        },
      });
    }

    const { actionId, approved } = ctx.req.valid("json");

    const result = await validateAction(auth, conversation, {
      actionId,
      approvalState: approved,
      messageId: mId,
    });

    if (result.isErr()) {
      switch (result.error.code) {
        case "action_not_blocked":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "action_not_blocked",
              message: result.error.message,
            },
          });
        case "action_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "action_not_found",
              message: result.error.message,
            },
          });
        default:
          return apiError(
            ctx,
            {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: "Failed to validate action",
              },
            },
            result.error
          );
      }
    }

    return ctx.json({ success: true });
  }
);

export default app;
