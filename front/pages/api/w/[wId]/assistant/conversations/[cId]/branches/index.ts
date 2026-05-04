/**
 * @ignoreswagger
 */

import {
  getMostRecentOpenBranchForConversation,
  type RenderedOpenBranch,
} from "@app/lib/api/assistant/conversation/branches";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetConversationOpenBranchResponse = {
  branch: RenderedOpenBranch | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetConversationOpenBranchResponse>>,
  auth: Authenticator
): Promise<void> {
  const { cId } = req.query;

  if (!isString(cId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `cId` (string) is required.",
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

  const branchRes = await getMostRecentOpenBranchForConversation(auth, {
    conversationId: cId,
  });
  if (branchRes.isErr()) {
    switch (branchRes.error.code) {
      case "conversation_not_found": {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "conversation_not_found",
            message: "Conversation not found.",
          },
        });
      }
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
        assertNever(branchRes.error.code);
    }
  }

  res.status(200).json({ branch: branchRes.value });
}

export default withSessionAuthenticationForWorkspace(handler);
