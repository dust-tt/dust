/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { buildShrinkWrapPromptForConversation } from "@app/lib/api/assistant/builder/sidekick_prompts";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<string>>,
  auth: Authenticator
): Promise<void> {
  const { conversationId } = req.query;

  if (!isString(conversationId)) {
    return apiError(req, res, {
      status_code: 422,
      api_error: {
        type: "unprocessable_entity",
        message: `The conversationId query parameter is invalid or missing.`,
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const result = await buildShrinkWrapPromptForConversation(
        auth,
        conversationId
      );
      if (result.isErr()) {
        return apiErrorForConversation(req, res, result.error);
      }
      return res.status(200).json(result.value);
    }
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
