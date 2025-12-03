import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { declineBlockedActionsForConversations } from "@app/lib/api/assistant/conversation/decline_blocked_actions";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { normalizeError } from "@app/types";

export type DeclineBlockedActionsResponse = {
  failedConversationIds: string[];
};

export const DismissAllActionsBodySchema = z.object({
  conversationIds: z.array(z.string()).min(1),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<DeclineBlockedActionsResponse>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const parseResult = DismissAllActionsBodySchema.safeParse(req.body);
  if (!parseResult.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${parseResult.error.message}. Provide conversationIds in the request body.`,
      },
    });
  }

  const { conversationIds } = parseResult.data;

  const result = await declineBlockedActionsForConversations(
    auth,
    conversationIds
  );

  if (result.isErr()) {
    logger.error(
      {
        error: result.error,
      },
      "Failed to decline blocked actions for conversations"
    );

    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: normalizeError(result.error).message,
      },
    });
  }

  return res.status(200).json({
    failedConversationIds: result.value.failedConversationIds,
  });
}

export default withSessionAuthenticationForWorkspace(handler);
