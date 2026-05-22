// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */
import { validateMCPServerAccess } from "@app/lib/api/actions/mcp/client_side_registry";
import { getMCPEventsForServer } from "@app/lib/api/assistant/mcp_events";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { initSSEResponse } from "@app/lib/api/sse";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const GetMCPRequestsRequestQuerySchema = z.object({
  serverId: z.string(),
  lastEventId: z.string().optional(),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<void>>,
  auth: Authenticator
): Promise<void> {
  const queryValidation = GetMCPRequestsRequestQuerySchema.safeParse(req.query);
  if (!queryValidation.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request query: ${fromError(queryValidation.error).toString()}`,
      },
    });
  }

  const { lastEventId, serverId } = queryValidation.data;

  const isValidAccess = await validateMCPServerAccess(auth, {
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

  initSSEResponse(res);

  // Create an AbortController to handle client disconnection.
  const controller = new AbortController();
  const { signal } = controller;

  // Use res.on("close") rather than req.on("close"): Next.js fully reads and
  // closes the request body before the handler runs, so req never emits "close"
  // on client disconnect. The response stream is still live and fires reliably.
  res.on("close", () => {
    controller.abort();
  });

  const mcpEvents = getMCPEventsForServer(
    auth,
    {
      lastEventId,
      mcpServerId: serverId,
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

export default withSessionAuthenticationForWorkspace(handler, {
  isStreaming: true,
});
