import type { NextApiRequest, NextApiResponse } from "next";

import type { ActionGeneratedFileType } from "@app/lib/actions/types";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { listGeneratedFiles } from "@app/lib/api/assistant/conversation/files";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type GetConversationFilesResponseBody = {
  files: ActionGeneratedFileType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetConversationFilesResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only GET method is supported.",
      },
    });
  }

  const { cId } = req.query;
  if (typeof cId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `cId` (string) is required.",
      },
    });
  }

  const conversationRes = await getConversation(auth, cId);
  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  const { value: conversation } = conversationRes;

  const files = listGeneratedFiles(conversation);

  return res.status(200).json({
    files,
  });
}

export default withSessionAuthenticationForWorkspace(handler);
