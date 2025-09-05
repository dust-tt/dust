import type { ValidateActionResponseType } from "@dust-tt/client";
import { ValidateActionRequestBodySchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { validateAction } from "@app/lib/api/assistant/conversation/validate_actions";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

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

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ValidateActionResponseType>>,
  auth: Authenticator
): Promise<void> {
  const { cId, mId } = req.query;
  if (typeof cId !== "string" || typeof mId !== "string") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation, message, or workspace not found.",
      },
    });
  }

  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  // Validate request body
  const parseResult = ValidateActionRequestBodySchema.safeParse(req.body);
  if (!parseResult.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${parseResult.error.message}`,
      },
    });
  }

  const conversationRes = await getConversation(auth, cId);
  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  const { actionId, approved } = parseResult.data;

  const result = await validateAction(auth, conversationRes.value, {
    actionId,
    approvalState: approved,
    messageId: mId,
  });

  if (result.isErr()) {
    switch (result.error.code) {
      case "action_not_blocked":
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "action_not_blocked",
            message: "Action not blocked.",
          },
        });
      case "action_not_found":
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "action_not_found",
            message: "Action not found.",
          },
        });
      default:
        return apiError(
          req,
          res,
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

  res.status(200).json({ success: true });
}

export default withPublicAPIAuthentication(handler, {
  isStreaming: true,
  requiredScopes: { POST: "update:conversation" },
});
