import { postNewContentFragment } from "@app/lib/api/assistant/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { InternalPostContentFragmentRequestBodySchema } from "@app/types/api/assistant";
import type { ContentFragmentType } from "@app/types/content_fragment";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
});

export type PostContentFragmentResponseBody = {
  contentFragment: ContentFragmentType;
};

// Mounted at /api/w/:wId/assistant/conversations/:cId/content_fragment.
const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/assistant/conversations/{cId}/content_fragment:
 *   post:
 *     summary: Create a content fragment
 *     description: Post a new content fragment to an existing conversation.
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
 *               - title
 *               - content
 *               - contentType
 *               - context
 *             properties:
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               contentType:
 *                 type: string
 *                 description: MIME type of the content
 *               url:
 *                 type: string
 *                 nullable: true
 *               context:
 *                 type: object
 *                 properties:
 *                   profilePictureUrl:
 *                     type: string
 *                     nullable: true
 *               fileId:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Successfully created content fragment
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 contentFragment:
 *                   $ref: '#/components/schemas/PrivateContentFragment'
 *       401:
 *         description: Unauthorized
 */

app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", InternalPostContentFragmentRequestBodySchema),
  async (ctx): HandlerResult<PostContentFragmentResponseBody> => {
    const auth = ctx.get("auth");
    const user = auth.getNonNullableUser();
    const { cId } = ctx.req.valid("param");

    const conversationRes =
      await ConversationResource.fetchConversationWithoutContent(auth, cId);
    if (conversationRes.isErr()) {
      return apiErrorForConversation(ctx, conversationRes.error);
    }

    const conversation = conversationRes.value;
    const contentFragmentPayload = ctx.req.valid("json");

    const baseContext = {
      username: user.username,
      fullName: user.fullName(),
      email: user.email,
    };

    const contentFragmentRes = await postNewContentFragment(
      auth,
      conversation,
      contentFragmentPayload,
      {
        ...baseContext,
        profilePictureUrl: contentFragmentPayload.context.profilePictureUrl,
      }
    );
    if (contentFragmentRes.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: contentFragmentRes.error.message,
        },
      });
    }

    return ctx.json({ contentFragment: contentFragmentRes.value });
  }
);

export default app;
