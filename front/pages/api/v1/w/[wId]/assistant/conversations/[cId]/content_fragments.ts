import type { PostContentFragmentResponseType } from "@dust-tt/client";
import { PublicPostContentFragmentRequestBodySchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

import {
  getConversation,
  postNewContentFragment,
} from "@app/lib/api/assistant/conversation";
import { toFileContentFragment } from "@app/lib/api/assistant/conversation/content_fragment";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isContentFragmentInputWithContentType } from "@app/types";

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

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostContentFragmentResponseType>>,
  auth: Authenticator
): Promise<void> {
  const { cId } = req.query;
  if (typeof cId !== "string") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found.",
      },
    });
  }

  const conversationRes = await getConversation(auth, cId);

  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  const conversation = conversationRes.value;

  switch (req.method) {
    case "POST":
      const r = PublicPostContentFragmentRequestBodySchema.safeParse(req.body);

      if (r.error) {
        const ve = fromError(r.error);
        console.log(ve.toString());

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: fromError(r.error).toString(),
          },
        });
      }

      if (r.data.content) {
        const { content } = r.data;
        if (content.length === 0 || content.length > 512 * 1024) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "The content must be a non-empty string of less than 512kB.",
            },
          });
        }
      }
      const { context, ...rest } = r.data;
      let contentFragment = rest;

      // If we receive a content fragment that is not file based, we transform it to a file-based
      // one.
      if (isContentFragmentInputWithContentType(contentFragment)) {
        const contentFragmentRes = await toFileContentFragment(auth, {
          contentFragment,
        });
        if (contentFragmentRes.isErr()) {
          if (contentFragmentRes.error.code === "file_type_not_supported") {
            return apiError(req, res, {
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
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: contentFragmentRes.error.message,
          },
        });
      }

      // TODO(pr, attach-ds): remove this once type support for content node fragment is added in the public API.
      // Will be tackled by https://github.com/dust-tt/tasks/issues/2388.
      // @ts-expect-error cf above
      res.status(200).json({ contentFragment: contentFragmentRes.value });
      return;
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

export default withPublicAPIAuthentication(handler, {
  requiredScopes: { POST: "update:conversation" },
});
