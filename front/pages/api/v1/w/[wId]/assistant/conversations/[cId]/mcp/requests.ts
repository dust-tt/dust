import type { GetConversationResponseType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { makeLocalMCPServerStringId } from "@app/lib/api/actions/mcp_local";
import { getConversation } from "@app/lib/api/assistant/conversation";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { getConversationMCPEventsForServer } from "@app/lib/api/assistant/mcp_events";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

/**
 * @ignoreswagger
 * /api/v1/w/{wId}/assistant/conversations/{cId}/mcp/requests:
 *   get:
 *     summary: Stream MCP tool requests for a conversation
 *     description: |
 *       Server-Sent Events (SSE) endpoint that streams MCP tool requests for a conversation.
 *       This endpoint is used by local MCP servers to listen for tool requests in real-time.
 *       The connection will remain open and events will be sent as new tool requests are made.
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
 *         description: ID of the MCP server to filter events for
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: |
 *           Connection established successfully. Events will be streamed in Server-Sent Events format.
 *           Each event will contain a tool request that needs to be processed by the MCP server.
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: object
 *               properties:
 *                 type:
 *                   type: string
 *                   description: Type of the event (e.g. "tool_request")
 *                 data:
 *                   type: object
 *                   description: The tool request data
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
  res: NextApiResponse<WithAPIErrorResponse<GetConversationResponseType>>,
  auth: Authenticator
): Promise<void> {
  const { cId, serverId: rawServerId, lastEventId } = req.query;
  if (typeof cId !== "string") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found.",
      },
    });
  }

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

  if (lastEventId && typeof lastEventId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid lastEventId parameter.",
      },
    });
  }

  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const conversationRes = await getConversation(auth, cId);
  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  // Create an AbortController to handle client disconnection.
  const controller = new AbortController();
  const { signal } = controller;

  // Handle client disconnection.
  req.on("close", () => {
    controller.abort();
  });

  const serverId = makeLocalMCPServerStringId(auth, {
    serverId: parsedServerId,
  });

  const conversationMcpEvents = getConversationMCPEventsForServer(
    {
      conversationId: cId,
      lastEventId,
      serverId,
    },
    signal
  );

  for await (const event of conversationMcpEvents) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);

    // @ts-expect-error - We need it for streaming but it does not exists in the types.
    res.flush();

    if (signal.aborted) {
      break;
    }
  }

  res.write("data: done\n\n");

  res.end();

  return;
}

export default withPublicAPIAuthentication(handler, {
  requiredScopes: { GET: "read:conversation" },
});
