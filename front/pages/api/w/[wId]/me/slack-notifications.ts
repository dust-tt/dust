import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getNovuClient } from "@app/lib/notifications";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type PostSlackNotificationResponseBody = {
  oauthUrl: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostSlackNotificationResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const userResource = auth.user();
  if (!userResource) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "not_authenticated",
        message: "User not authenticated.",
      },
    });
  }

  switch (req.method) {
    case "POST": {
      const workspace = auth.workspace();
      if (!workspace) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_not_found",
            message: "Workspace not found.",
          },
        });
      }
      const novu = await getNovuClient();
      const oauthUrlRes = await novu.integrations.generateChatOAuthUrl({
        integrationIdentifier: "slack",
        subscriberId: userResource.sId,
        context: { workspaceId: workspace.sId },
      });
      return res.status(200).json({ oauthUrl: oauthUrlRes.result.url });
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
