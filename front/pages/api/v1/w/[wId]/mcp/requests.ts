import type { NextApiRequest, NextApiResponse } from "next";

import { validateMCPServerAccess } from "@app/lib/api/actions/mcp/client_side_registry";
import { getMCPEventsForServer } from "@app/lib/api/assistant/mcp_events";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isValidUUIDv4 } from "@app/types";

/**
 * @ignoreswagger
 * /api/v1/w/{wId}/mcp/requests:
 *   get:
 *     summary: Stream MCP tool requests for a workspace
 *     description: |
 *       Server-Sent Events (SSE) endpoint that streams MCP tool requests for a workspace.
 *       This endpoint is used by local MCP servers to listen for tool requests in real-time.
 *       The connection will remain open and events will be sent as new tool requests are made.
 *     tags:
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
 *       - in: query
 *         name: serverId
 *         required: true
 *         description: UUID of the MCP server to filter events for
 *         schema:
 *           type: string
 *       - in: query
 *         name: lastEventId
 *         required: false
 *         description: ID of the last event to filter events for
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
 *       403:
 *         description: Forbidden. You don't have access to this workspace or MCP server.
 *       500:
 *         description: Internal Server Error.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<void>>,
  auth: Authenticator
): Promise<void> {
  const { serverId, lastEventId } = req.query;

  // Extract the client-provided server ID.
  if (typeof serverId !== "string" || !isValidUUIDv4(serverId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid server ID format. Must be a valid UUID.",
      },
    });
  }

  const isValidAccess = await validateMCPServerAccess(auth, {
    workspaceId: auth.getNonNullableWorkspace().sId,
    serverId,
  });
  if (!isValidAccess) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "mcp_auth_error",
        message: "You don't have access to this MCP server or it has expired.",
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

  const mcpEvents = getMCPEventsForServer(
    auth,
    {
      mcpServerId: serverId,
      lastEventId,
    },
    signal
  );

  for await (const event of mcpEvents) {
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
  isStreaming: true,
});
