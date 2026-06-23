import { postNewContentFragment } from "@app/lib/api/assistant/conversation";
import { toFileContentFragment } from "@app/lib/api/assistant/conversation/content_fragment";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import {
  isContentFragmentInput,
  isContentFragmentInputWithInlinedContent,
} from "@app/types/api/assistant";
import { isInteractiveContentType } from "@app/types/files";
import {
  type PostContentFragmentResponseType,
  PublicPostContentFragmentRequestBodySchema,
} from "@dust-tt/client";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
});

// Mounted at /api/v1/w/:wId/assistant/conversations/:cId/content_fragments.
const app = publicApiApp();

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/conversations/{cId}/content_fragments:
 *   post:
 *     summary: Create a content fragment
 *     description: Create a new content fragment in the workspace identified by {wId}.
 *     tags:
 *       - Conversations
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
 *             $ref: '#/components/schemas/ContentFragment'
 *     responses:
 *       200:
 *         description: Content fragment created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ContentFragment'
 *       400:
 *         description: Bad Request. Missing or invalid parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       500:
 *         description: Internal Server Error.
 */
app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", PublicPostContentFragmentRequestBodySchema),
  async (ctx): HandlerResult<PostContentFragmentResponseType> => {
    const auth = ctx.get("auth");
    const { cId } = ctx.req.valid("param");

    const conversationRes = await getConversation(auth, cId);
    if (conversationRes.isErr()) {
      return apiErrorForConversation(ctx, conversationRes.error);
    }

    const conversation = conversationRes.value;
    const data = ctx.req.valid("json");

    if (data.content) {
      const { content } = data;
      if (content.length === 0 || content.length > 512 * 1024) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The content must be a non-empty string of less than 512kB.",
          },
        });
      }
    }
    const { context, ...rest } = data;
    let contentFragment = rest;

    if (!isContentFragmentInput(contentFragment)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Unsupported content fragment type.",
        },
      });
    }

    // If we receive a content fragment that is not file based, we transform it to a file-based
    // one.
    if (isContentFragmentInputWithInlinedContent(contentFragment)) {
      const contentFragmentRes = await toFileContentFragment(auth, {
        conversation,
        contentFragment,
      });
      if (contentFragmentRes.isErr()) {
        if (contentFragmentRes.error.code === "file_type_not_supported") {
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: contentFragmentRes.error.message,
            },
          });
        }
        throw new Error(contentFragmentRes.error.message);
      }
      contentFragment = contentFragmentRes.value;
    }
    const contentFragmentRes = await postNewContentFragment(
      auth,
      conversation,
      contentFragment,
      {
        email: context?.email ?? null,
        fullName: context?.fullName ?? null,
        username: context?.username ?? null,
        profilePictureUrl: context?.profilePictureUrl ?? null,
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

    const publicContentFragment =
      !contentFragmentRes.value ||
      isInteractiveContentType(contentFragmentRes.value.contentType)
        ? undefined
        : {
            ...contentFragmentRes.value,
            contentType: contentFragmentRes.value.contentType,
          };

    if (!publicContentFragment) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Content fragment is not supported.",
        },
      });
    }

    return ctx.json({ contentFragment: publicContentFragment });
  }
);

export default app;
