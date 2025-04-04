import { PublicPostMCPResultsRequestBodySchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

import {
  getMCPServerResultsChannelId,
  makeLocalMCPServerStringId,
  parseLocalMCPRequestId,
} from "@app/lib/api/actions/mcp_local";
import { getConversation } from "@app/lib/api/assistant/conversation";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { fetchMessageInConversation } from "@app/lib/api/assistant/messages";
import { publishEvent } from "@app/lib/api/assistant/pubsub";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

/**
 * @ignoreswagger
 * /api/v1/w/{wId}/assistant/conversations/{cId}/mcp/results:
 *   post:
 *     summary: Submit MCP tool execution results
 *     description: |
 *       Endpoint for local MCP servers to submit the results of tool executions.
 *       This endpoint accepts the output from tools that were executed locally.
 *     tags:
 *       - Conversations
 *       - MCP
 *     security:
 *       - BearerAuth: []
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
 *       - in: query
 *         name: serverId
 *         required: true
 *         description: ID of the MCP server submitting the results
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - requestId
 *               - result
 *             properties:
 *               requestId:
 *                 type: string
 *                 description: ID of the original tool request
 *               result:
 *                 type: object
 *                 description: The result data from the tool execution
 *     responses:
 *       200:
 *         description: Tool execution results successfully submitted
 *       400:
 *         description: Bad Request. Missing or invalid parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       404:
 *         description: Conversation not found.
 *       500:
 *         description: Internal Server Error.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<{ success: true }>>,
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

  const { serverId: rawServerId } = req.query;
  const parsedServerId =
    typeof rawServerId === "string" ? parseInt(rawServerId, 10) : null;
  if (parsedServerId === null || Number.isNaN(parsedServerId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid serverId parameter.",
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

  const r = PublicPostMCPResultsRequestBodySchema.safeParse(req.body);
  if (r.error) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: fromError(r.error).toString(),
      },
    });
  }

  const conversationRes = await getConversation(auth, cId);
  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  const parsed = parseLocalMCPRequestId(r.data.requestId);
  if (!parsed) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid requestId",
      },
    });
  }

  const { conversationId, messageId } = parsed;
  if (conversationId !== cId) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid requestId",
      },
    });
  }

  const message = await fetchMessageInConversation(
    auth,
    conversationRes.value,
    messageId
  );
  if (!message || !message.agentMessage) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "message_not_found",
        message: "Message not found.",
      },
    });
  }

  const serverId = makeLocalMCPServerStringId(auth, {
    serverId: parsedServerId,
  });

  // Publish MCP action results.
  await publishEvent({
    origin: "mcp_local_results",
    channel: getMCPServerResultsChannelId({
      conversationId: cId,
      mcpServerId: serverId,
    }),
    event: JSON.stringify({
      type: "mcp_local_results",
      messageId,
      result: r.data.result,
    }),
  });

  res.status(200).json({
    success: true,
  });

  return;
}

export default withPublicAPIAuthentication(handler, {
  requiredScopes: { POST: "update:conversation" },
});
