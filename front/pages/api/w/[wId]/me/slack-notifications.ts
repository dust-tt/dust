import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import {
  getNovuClient,
  getSlackConnectionIdentifier,
  isSlackChannelConfigured,
} from "@app/lib/notifications";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { WebClient } from "@slack/web-api";
import type { NextApiRequest, NextApiResponse } from "next";

export type PostSlackNotificationResponseBody = {
  oauthUrl: string;
};

export type PatchSlackNotificationResponseBody = {
  success: boolean;
};

export type GetSlackNotificationResponseBody = {
  isConfigured: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | GetSlackNotificationResponseBody
      | PostSlackNotificationResponseBody
      | PatchSlackNotificationResponseBody
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
      const isConfigured = await isSlackChannelConfigured(userResource.sId);

      return res.status(200).json({
        isConfigured,
      });
    }
    case "POST": {
      const slackBotConnections =
        await DataSourceResource.listByConnectorProvider(auth, "slack_bot");

      if (slackBotConnections.length === 0) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "data_source_not_found",
            message: "Slack Bot is not configured for this workspace.",
          },
        });
      }
      const novu = await getNovuClient();

      const oauthUrlRes = await novu.integrations.generateChatOAuthUrl({
        integrationIdentifier: "slack",
        connectionIdentifier: getSlackConnectionIdentifier(userResource.sId),
        subscriberId: userResource.sId,
      });
      return res.status(200).json({ oauthUrl: oauthUrlRes.result.url });
    }
    case "PATCH": {
      // We want to setup a novu slack channel endpoint for the user,
      // so that he can receive notifications as private messages in Slack.
      // To do so, we need to find the user's slack id.
      const novu = await getNovuClient();
      const slackChannelConnection = await novu.channelConnections.retrieve(
        getSlackConnectionIdentifier(userResource.sId)
      );

      const slackClient = new WebClient(
        slackChannelConnection.result.auth.accessToken
      );
      const userResult = await slackClient.users.lookupByEmail({
        email: userResource.email,
      });

      if (!userResult.user?.id) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "user_not_found",
            message:
              "No Slack user found with the email of the authenticated user.",
          },
        });
      }

      await novu.channelEndpoints.create({
        subscriberId: userResource.sId,
        integrationIdentifier: "slack",
        connectionIdentifier: getSlackConnectionIdentifier(userResource.sId),
        type: "slack_user",
        endpoint: {
          userId: userResult.user.id,
        },
      });

      return res.status(200).json({
        success: true,
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET, POST or PATCH is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
