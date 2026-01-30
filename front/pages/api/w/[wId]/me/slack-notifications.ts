import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getNovuClient } from "@app/lib/notifications";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

export type PostSlackNotificationResponseBody = {
  oauthUrl: string;
};

export type GetSlackNotificationResponseBody = {
  isConfigured: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetSlackNotificationResponseBody | PostSlackNotificationResponseBody
    >
  >,
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
    case "GET": {
      const novu = await getNovuClient();
      const slackConnection = await novu.channelEndpoints.list({
        subscriberId: userResource.sId,
        integrationIdentifier: "slack",
        channel: "chat",
      });

      return res.status(200).json({
        isConfigured: slackConnection.result.data.length > 0,
      });
    }
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
        scope: [
          "incoming-webhook",
          "chat:write",
          "chat:write.public",
          "channels:read",
          "groups:read",
          "users:read",
          "users:read.email",
        ],
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
