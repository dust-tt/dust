import type { ValidateActionResponseType } from "@dust-tt/client";
import { ValidateActionRequestBodySchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { MCPActionType } from "@app/lib/actions/mcp";
import { getConversation } from "@app/lib/api/assistant/conversation";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { validateAction } from "@app/lib/api/assistant/conversation/validate_actions";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
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

  // Temporary code to be backwards compatible with the old actionId format.
  // TODO(MCP 2025-06-09): Remove this once all extensions are updated.
  let actionIdString: string;
  if (typeof actionId === "string") {
    actionIdString = actionId;
  } else {
    actionIdString = MCPActionType.modelIdToSId({
      id: actionId,
      workspaceId: auth.getNonNullableWorkspace().id,
    });
  }

  try {
    const result = await validateAction({
      workspaceId: auth.getNonNullableWorkspace().sId,
      conversationId: cId,
      messageId: mId,
      actionId: actionIdString,
      approved,
    });

    res.status(200).json(result);
  } catch (error) {
    logger.error(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        conversationId: cId,
        messageId: mId,
        actionId,
        error,
      },
      "Error publishing action validation event"
    );

    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to publish action validation event",
      },
    });
  }
}

export default withPublicAPIAuthentication(handler, {
  isStreaming: true,
  requiredScopes: { POST: "update:conversation" },
});
