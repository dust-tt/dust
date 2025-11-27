import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { declineBlockedActionsForConversations } from "@app/lib/api/assistant/conversation/decline_blocked_actions";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type DeclineBlockedActionsResponse = {
  success: true;
  totalFailedActions: number;
};

export const DismissAllActionsQuerySchema = z.object({
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

  if (
    req.query.conversationIds &&
    typeof req.query.conversationIds === "string"
  ) {
    req.query.conversationIds = [req.query.conversationIds];
  }

  const parseResult = DismissAllActionsQuerySchema.safeParse(req.query);
  if (!parseResult.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid query parameters: ${parseResult.error.message}. Provide conversationIds as query parameters.`,
      },
    });
  }

  const { conversationIds } = parseResult.data;

  if (conversationIds.length === 0) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "At least one conversation ID is required",
      },
    });
  }

  const result = await declineBlockedActionsForConversations(
    auth,
    conversationIds
  );

  if (result.isErr()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          result.error instanceof Error
            ? result.error.message
            : "Failed to decline blocked actions",
      },
    });
  }

  return res.status(200).json({
    success: true,
    totalFailedActions: result.value.failedActionCount,
  });
}

export default withSessionAuthenticationForWorkspace(handler);
