import type { ContentFragmentType, WithAPIErrorReponse } from "@dust-tt/types";
import { PublicPostContentFragmentRequestBodySchema } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import type * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  getConversation,
  normalizeContentFragmentType,
  postNewContentFragment,
} from "@app/lib/api/assistant/conversation";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

export type PostContentFragmentsResponseBody = {
  contentFragment: ContentFragmentType;
};

export type PostContentFragmentRequestBody = t.TypeOf<
  typeof PublicPostContentFragmentRequestBodySchema
>;

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
 *       - in: header
 *         name: Authorization
 *         required: true
 *         description: Bearer token for authentication
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: The title of the content fragment
 *                 example: My content fragment
 *               content:
 *                 type: string
 *                 description: The content of the content fragment
 *                 example: This is my content fragment
 *               url:
 *                 type: string
 *                 description: The URL of the content fragment
 *                 example: https://example.com/content
 *               contentType:
 *                 type: string
 *                 description: The content type of the content fragment
 *                 example: text/plain
 *               context:
 *                 type: object
 *                 properties:
 *                   username:
 *                     type: string
 *                     description: The username of the user who created the content fragment
 *                     example: johndoe
 *                   fullName:
 *                     type: string
 *                     description: The full name of the user who created the content fragment
 *                     example: John Doe
 *                   email:
 *                     type: string
 *                     description: The email of the user who created the content fragment
 *                     example: johndoe@example.com
 *                   profilePictureUrl:
 *                     type: string
 *                     description: The profile picture URL of the user who created the content fragment
 *                     example: https://example.com/profile_picture.jpg
 *     responses:
 *       200:
 *         description: Content fragment created successfully.
 *       400:
 *         description: Bad Request. Missing or invalid parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       500:
 *         description: Internal Server Error.
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorReponse<PostContentFragmentsResponseBody>>
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }

  const { auth, keyWorkspaceId } = await Authenticator.fromKey(
    keyRes.value,
    req.query.wId as string
  );

  if (!auth.isBuilder() || keyWorkspaceId !== req.query.wId) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The Assistant API is only available on your own workspace.",
      },
    });
  }

  const conversation = await getConversation(auth, req.query.cId as string);
  if (!conversation) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const bodyValidation = PublicPostContentFragmentRequestBodySchema.decode(
        req.body
      );

      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const { content, title, url, contentType, context } =
        bodyValidation.right;

      if (content.length === 0 || content.length > 64 * 1024) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The content must be a non-empty string of less than 64kb.",
          },
        });
      }
      const normalizedContentType = normalizeContentFragmentType({
        contentType,
        url: req.url,
      });
      const contentFragment = await postNewContentFragment(auth, {
        conversation,
        title,
        content,
        url,
        contentType: normalizedContentType,
        context: {
          username: context?.username || null,
          fullName: context?.fullName || null,
          email: context?.email || null,
          profilePictureUrl: context?.profilePictureUrl || null,
        },
      });

      res.status(200).json({ contentFragment });
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

export default withLogging(handler);
