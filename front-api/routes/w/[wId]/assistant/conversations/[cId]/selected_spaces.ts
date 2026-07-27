import { addSelectedConversationSpaces } from "@app/lib/api/assistant/conversation/selected_spaces";
import { getAuditLogContext } from "@app/lib/api/audit/workos_audit";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import { apiErrorForSelectedSpaces } from "./selected_spaces_errors";

const ParamsSchema = z.object({
  cId: z.string(),
});

const AddSelectedConversationSpacesRequestSchema = z.object({
  mode: z.literal("add"),
  spaceIds: z.array(z.string()),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/selected_spaces.
const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/assistant/conversations/{cId}/selected_spaces:
 *   post:
 *     summary: Select Spaces for a conversation
 *     description: Appends regular Spaces to a conversation's explicit selected scope.
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - mode
 *               - spaceIds
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [add]
 *               spaceIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Selected Spaces and effective ACL summary.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 selectedSpaces:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/PrivateSpace'
 *                       - type: object
 *                         properties:
 *                           selected:
 *                             type: boolean
 *                 effectiveAcl:
 *                   type: object
 *                   properties:
 *                     spaceIds:
 *                       type: array
 *                       items:
 *                         type: string
 *                     viewerMustHaveAll:
 *                       type: boolean
 *       401:
 *         description: Unauthorized
 */
app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", AddSelectedConversationSpacesRequestSchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { cId: conversationId } = ctx.req.valid("param");
    const { spaceIds } = ctx.req.valid("json");

    const conversationRes =
      await ConversationResource.fetchConversationWithoutContent(
        auth,
        conversationId
      );
    if (conversationRes.isErr()) {
      return apiErrorForConversation(ctx, conversationRes.error);
    }

    const result = await addSelectedConversationSpaces(auth, {
      conversation: conversationRes.value,
      spaceIds,
      origin: "input_bar",
      auditContext: getAuditLogContext(auth),
      // Widening the scope of an existing conversation is irreversible and can lock the other
      // participants out, so only its creator may do it.
      enforceCreatorOnly: true,
    });
    if (result.isErr()) {
      return apiErrorForSelectedSpaces(ctx, result.error);
    }

    return ctx.json(result.value);
  }
);

export default app;
