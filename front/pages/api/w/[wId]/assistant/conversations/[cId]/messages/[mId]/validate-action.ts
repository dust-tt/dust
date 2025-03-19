import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { getConversation } from "@app/lib/api/assistant/conversation";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getRedisClient } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

const ValidateActionSchema = z.object({
  actionId: z.number(),
  approved: z.boolean(),
});

type ValidateActionResponse = {
  success: boolean;
};

/**
 * API endpoint to validate or reject agent actions that require user approval
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ValidateActionResponse>>,
  auth: Authenticator
): Promise<void> {
  // Validate URL parameters
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

  // Get the conversation to validate that the user has access to it
  const conversationRes = await getConversation(auth, cId);
  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
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

  const { actionId, approved } = parseResult.data;

  try {
    const redis = await getRedisClient({ origin: "assistant_generation" });

    // Store the validation result in Redis with a key that the backend will check
    // Use a more specific key format that includes the conversation ID to avoid collisions
    // between different conversations
    const validationKey = `assistant:action:validation:${cId}:${mId}:${actionId}`;

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

    if (approved) {
      // For approved actions, just store "approved"
      await redis.set(validationKey, "approved", {
        EX: 3600, // 1 hour expiration
      });
      logger.info(
        {
          workspaceId: wId,
          conversationId: cId,
          messageId: mId,
          actionId,
        },
        "Action approved by user"
      );
    } else {
      // For rejected actions, store the rejection message if provided
      await redis.set(validationKey, `rejected`, {
        EX: 3600, // 1 hour expiration
      });
      logger.info(
        {
          workspaceId: wId,
          conversationId: cId,
          messageId: mId,
          actionId,
        },
        "Action rejected by user"
      );
    }

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
      "Error storing action validation result"
    );

    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to store action validation result",
      },
    });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
