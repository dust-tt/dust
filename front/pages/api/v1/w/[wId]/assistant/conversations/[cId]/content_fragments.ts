import type { ContentFragmentType, WithAPIErrorResponse } from "@dust-tt/types";
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
import { withPublicAPIAuthentication } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

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
  res: NextApiResponse<WithAPIErrorResponse<PostContentFragmentsResponseBody>>,
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

  const conversation = await getConversation(auth, cId);
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

      const { right: contentFragmentBody } = bodyValidation;
      const { content, contentType } = contentFragmentBody;

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

      const contentFragmentRes = await postNewContentFragment(
        auth,
        conversation,
        {
          ...contentFragmentBody,
          contentType: normalizedContentType,
        },
        contentFragmentBody.context
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

export default withPublicAPIAuthentication(handler);
