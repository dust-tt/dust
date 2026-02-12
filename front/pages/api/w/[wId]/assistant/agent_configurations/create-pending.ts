import type { NextApiRequest, NextApiResponse } from "next";

import { createPendingAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";

export type PostPendingAgentResponseBody = {
  sId: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostPendingAgentResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (!auth.user()) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "not_authenticated",
        message: "You must be authenticated to create a pending agent.",
      },
    });
  }

  switch (req.method) {
    case "POST": {
      const { sId } = await createPendingAgentConfiguration(auth);
      return res.status(200).json({ sId });
    }

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
