import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { validateAction } from "@app/lib/api/assistant/conversation/validate_actions";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export const ValidateActionSchema = z.object({
  actionId: z.string(),
  approved: z.enum(["approved", "rejected", "always_approved"]),
});

export type ValidateActionResponse = {
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
  const { cId, mId } = req.query;
  if (typeof cId !== "string" || typeof mId !== "string") {
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

  // Validate request body.
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

  const { actionId, approved } = parseResult.data;

  const result = await validateAction(auth, conversationRes.value, {
    actionId,
    approvalState: approved,
    messageId: mId,
  });

  if (result.isErr()) {
    switch (result.error.code) {
      case "action_not_blocked":
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "action_not_blocked",
            message: "Action not blocked.",
          },
        });
      case "action_not_found":
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "action_not_found",
            message: "Action not found.",
          },
        });
      default:
        return apiError(
          req,
          res,
          {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "Failed to validate action",
            },
          },
          result.error
        );
    }
  }

  res.status(200).json({ success: true });
}

export default withSessionAuthenticationForWorkspace(handler);
