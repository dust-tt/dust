import { validateMCPServerAccess } from "@app/lib/api/actions/mcp/client_side_registry";
import { getMCPEventsForServer } from "@app/lib/api/assistant/mcp_events";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

const GetMCPRequestsRequestQueryCodec = t.intersection([
  t.type({
    serverId: t.string,
  }),
  t.partial({
    lastEventId: t.string,
  }),
]);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<void>>,
  auth: Authenticator
): Promise<void> {
  const queryValidation = GetMCPRequestsRequestQueryCodec.decode(req.query);
  if (isLeft(queryValidation)) {
    const pathError = reporter.formatValidationErrors(queryValidation.left);
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request query: ${pathError}`,
      },
    });
  }

  const { lastEventId, serverId } = queryValidation.right;

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
