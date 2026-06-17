import { listSelectableRestrictedSpaces } from "@app/lib/api/assistant/conversation/selected_spaces";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import { apiErrorForSelectedSpaces } from "./selected_spaces";

const ParamsSchema = z.object({
  cId: z.string(),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/selectable_spaces.
const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/assistant/conversations/{cId}/selectable_spaces:
 *   get:
 *     summary: List selectable restricted Spaces
 *     description: Lists restricted regular Spaces the user can select for a conversation, with current selection state.
 *     tags:
 *       - Private Conversations
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: cId
 *         required: true
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Selectable Spaces for the conversation.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 spaces:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/PrivateSpace'
 *                       - type: object
 *                         properties:
 *                           selected:
 *                             type: boolean
 *       401:
 *         description: Unauthorized
 */
app.get("/", validate("param", ParamsSchema), async (ctx) => {
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

  const result = await listSelectableRestrictedSpaces(auth, {
    conversation: conversationRes.value,
  });
  if (result.isErr()) {
    return apiErrorForSelectedSpaces(ctx, result.error);
  }

  return ctx.json({ spaces: result.value });
});

export default app;
