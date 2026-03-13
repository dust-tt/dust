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
import { postNewContentFragment } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import { InternalPostContentFragmentRequestBodySchema } from "@app/types/api/internal/assistant";
import type { ContentFragmentType } from "@app/types/content_fragment";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<{ contentFragment: ContentFragmentType }>
  >,
  auth: Authenticator
): Promise<void> {
  const user = auth.getNonNullableUser();

  if (!(typeof req.query.cId === "string")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `cId` (string) is required.",
      },
    });
  }

  const conversationId = req.query.cId;
  const conversationRes = await getConversation(auth, conversationId);

  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  const conversation = conversationRes.value;

  switch (req.method) {
    case "POST":
      const bodyValidation =
        InternalPostContentFragmentRequestBodySchema.decode(req.body);

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

      const contentFragmentPayload = bodyValidation.right;
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

export default withSessionAuthenticationForWorkspace(handler);
