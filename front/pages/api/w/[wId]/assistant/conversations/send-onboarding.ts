import type { NextApiRequest, NextApiResponse } from "next";

import { createOnboardingConversationIfNeeded } from "@app/lib/api/assistant/onboarding";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type PostSendOnboardingResponseBody = {
  conversationSId: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PostSendOnboardingResponseBody | void>
  >,
  auth: Authenticator
): Promise<void> {
  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only superusers can send onboarding conversations.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const result = await createOnboardingConversationIfNeeded(auth, {
        force: true,
      });

      if (result.isErr()) {
        return apiError(req, res, result.error);
      }

      const conversationSId = result.value;
      if (!conversationSId) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to create onboarding conversation.",
          },
        });
      }

      res.status(200).json({ conversationSId });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
