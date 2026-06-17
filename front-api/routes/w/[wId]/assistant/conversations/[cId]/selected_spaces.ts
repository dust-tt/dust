import {
  addSelectedConversationSpaces,
  type SelectedConversationSpacesError,
} from "@app/lib/api/assistant/conversation/selected_spaces";
import { getAuditLogContext } from "@app/lib/api/audit/workos_audit";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
});

const AddSelectedConversationSpacesRequestSchema = z.object({
  mode: z.literal("add"),
  spaceIds: z.array(z.string()),
});

export function apiErrorForSelectedSpaces(
  ctx: Parameters<typeof apiError>[0],
  error: SelectedConversationSpacesError
) {
  switch (error.code) {
    case "feature_flag_not_found":
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "feature_flag_not_found",
          message: error.message,
        },
      });
    case "conversation_not_mutable":
    case "space_not_restricted":
    case "space_not_selectable":
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: error.message,
        },
      });
    case "space_not_found":
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "space_not_found",
          message: error.message,
        },
      });
    default:
      assertNever(error.code);
  }
}

// Mounted at /api/w/:wId/assistant/conversations/:cId/selected_spaces.
const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/assistant/conversations/{cId}/selected_spaces:
 *   post:
 *     summary: Select restricted Spaces for a conversation
 *     description: Appends restricted regular Spaces to a conversation's explicit selected scope.
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
    });
    if (result.isErr()) {
      return apiErrorForSelectedSpaces(ctx, result.error);
    }

    return ctx.json(result.value);
  }
);

export default app;
