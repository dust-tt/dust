import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { getConversation } from "@app/lib/api/assistant/conversation";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { publishEvent } from "@app/lib/api/assistant/pubsub";
import { withPublicAPIAuthentication, withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

const ValidateActionSchema = z.object({
  actionId: z.number(),
  approved: z.boolean(),
  paramsHash: z.any(),
});

type ValidateActionResponse = {
  success: boolean;
};


/**
 * @ignoreswagger
 * Not documented yet. MCP specific endpoint.
 * TODO(mcp): Add swagger documentation once mcp is public
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ValidateActionResponse>>,
  auth: Authenticator
): Promise<void> {
  const { cId, mId, wId } = req.query;
  if (
    typeof cId !== "string" ||
    typeof mId !== "string" ||
    typeof wId !== "string"
  ) {
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
  const parseResult = ValidateActionSchema.safeParse(req.body);
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

  const { actionId, approved, paramsHash } = parseResult.data;

  try {
    const actionChannel = `action-${actionId}`;
    const eventType = approved ? "action_approved" : "action_rejected";

    logger.info(
      {
        workspaceId: wId,
        conversationId: cId,
        messageId: mId,
        actionId,
        approved,
      },
      "Action validation request"
    );

    // Publish validation event to the action channel
    await publishEvent({
      origin: "action_validation",
      channel: actionChannel,
      event: JSON.stringify({
        type: eventType,
        created: Date.now(),
        actionId: actionId,
        messageId: mId,
        paramsHash: paramsHash,
      }),
    });

    logger.info(
      {
        workspaceId: wId,
        conversationId: cId,
        messageId: mId,
        actionId,
      },
      `Action ${approved ? "approved" : "rejected"} by user`
    );

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error(
      {
        workspaceId: wId,
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
