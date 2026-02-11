import type { NextApiRequest, NextApiResponse } from "next";

import { createOnboardingConversationIfNeeded } from "@app/lib/api/assistant/onboarding";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";

export type PostSendOnboardingResponseBody = {
  conversationSId: string | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PostSendOnboardingResponseBody | void>
  >,
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

  // Accept language from body or fall back to Accept-Language header.
  const bodyLanguage = req.body?.language;
  const acceptLanguage = req.headers["accept-language"];
  const language = isString(bodyLanguage)
    ? bodyLanguage
    : (acceptLanguage?.split(",")[0]?.split("-")[0] ?? null);

  // Only superusers can force creation (for testing purposes).
  const force = auth.isDustSuperUser() && req.body?.force === true;

  const result = await createOnboardingConversationIfNeeded(auth, {
    force,
    language,
  });

  if (result.isErr()) {
    return apiError(req, res, result.error);
  }

  return res.status(200).json({ conversationSId: result.value });
}

export default withSessionAuthenticationForWorkspace(handler);
