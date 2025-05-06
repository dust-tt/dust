import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { validateMCPServerAccess } from "@app/lib/api/actions/mcp/local_registry";
import {
  getMCPServerResultsChannelId,
  parseLocalMCPRequestId,
} from "@app/lib/api/actions/mcp_local";
import { getConversation } from "@app/lib/api/assistant/conversation";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { fetchMessageInConversation } from "@app/lib/api/assistant/messages";
import { publishEvent } from "@app/lib/api/assistant/pubsub";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isValidUUIDv4 } from "@app/types";

const PostMCPResultsRequestBodyCodec = t.type({
  requestId: t.string,
  result: t.unknown,
});

type PostMCPResultsResponseType = {
  success: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostMCPResultsResponseType>>,
  auth: Authenticator
): Promise<void> {
  // Extract the client-provided server ID.
  const { serverId } = req.query;
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

  const r = PostMCPResultsRequestBodyCodec.decode(req.body);
  if (isLeft(r)) {
    const pathError = reporter.formatValidationErrors(r.left);

    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: pathError.join(","),
      },
    });
  }

  const parsed = parseLocalMCPRequestId(r.right.requestId);
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

  // Verify the conversation exists and user has access.
  const conversationRes = await getConversation(auth, conversationId);
  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  // Verify the message exists.
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

  // Publish MCP action results.
  await publishEvent({
    origin: "mcp_local_results",
    channel: getMCPServerResultsChannelId(auth, {
      mcpServerId: serverId,
    }),
    event: JSON.stringify({
      type: "mcp_local_results",
      messageId,
      result: r.right.result,
    }),
  });

  res.status(200).json({
    success: true,
  });

  return;
}

export default withSessionAuthenticationForWorkspace(handler);
