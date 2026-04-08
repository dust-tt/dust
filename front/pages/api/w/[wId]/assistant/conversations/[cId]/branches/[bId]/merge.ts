/** @ignoreswagger */
import { mergeConversationBranch } from "@app/lib/api/assistant/conversation/branches";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export type MergeConversationBranchResponse = {
  mergedUserMessageId: string;
  mergedAgentMessageIds: string[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<MergeConversationBranchResponse>>,
  auth: Authenticator
): Promise<void> {
  const { cId, bId } = req.query;

  if (!isString(cId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `cId` (string) is required.",
      },
    });
  }

  if (!isString(bId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `bId` (string) is required.",
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

  const mergeRes = await mergeConversationBranch(auth, {
    branchId: bId,
    conversationId: cId,
  });
  if (mergeRes.isErr()) {
    switch (mergeRes.error.code) {
      case "branch_not_found": {
        return apiError(req, res, {
          status_code: 404,
          api_error: { type: "branch_not_found", message: "Branch not found." },
        });
      }
      case "conversation_not_found": {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "conversation_not_found",
            message: "Conversation not found.",
          },
        });
      }
      case "branch_write_not_authorized": {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "Not authorized to modify this branch.",
          },
        });
      }
      case "branch_not_open": {
        return apiError(req, res, {
          status_code: 409,
          api_error: {
            type: "invalid_request_error",
            message: "Branch is not open.",
          },
        });
      }
      case "branch_has_no_user_message":
      case "internal_error": {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Internal server error",
          },
        });
      }
      default:
        assertNever(mergeRes.error.code);
    }
  }

  res.status(200).json({
    mergedUserMessageId: mergeRes.value.mergedUserMessageId,
    mergedAgentMessageIds: mergeRes.value.mergedAgentMessageIds,
  });
}

export default withSessionAuthenticationForWorkspace(handler);
