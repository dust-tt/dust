import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import {
  getNovuClient,
  getSlackConnectionIdentifier,
} from "@app/lib/notifications";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import type { WithAPIErrorResponse } from "@app/types/error";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import { WebClient } from "@slack/web-api";
import assert from "assert";
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
      const novu = await getNovuClient();

      const connectionIdentifier = getSlackConnectionIdentifier(
        userResource.sId
      );

      const slackChannelConnections = await novu.channelConnections.list({
        subscriberId: userResource.sId,
        integrationIdentifier: "slack",
        channel: "chat",
      });

      const slackChannelConnection = slackChannelConnections.result.data.find(
        (connection) => connection.identifier === connectionIdentifier
      );

      if (!slackChannelConnection) {
        return res.status(200).json({
          isConfigured: false,
        });
      }

      const slackChannelEndpoints = await novu.channelEndpoints.list({
        subscriberId: userResource.sId,
        integrationIdentifier: "slack",
        connectionIdentifier,
        channel: "chat",
      });

      return res.status(200).json({
        isConfigured: slackChannelEndpoints.result.data.length > 0,
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
      // To do so, we need to find the user's slack id. We are reusing the
      // Dust Slack Bot app to send notifications, so we get its token
      // to be able to call the Slack API and find the user's slack id by his email.
      const novu = await getNovuClient();
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

      assert(
        slackBotConnections.length === 1,
        "There should be exactly one Slack bot connection for the workspace."
      );

      const slackConnection = slackBotConnections[0];

      if (!slackConnection.connectorId) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "connector_not_found_error",
            message: "Invalid Slack connection configuration.",
          },
        });
      }

      const connectorsAPI = new ConnectorsAPI(
        config.getConnectorsAPIConfig(),
        logger
      );

      const connectorRes = await connectorsAPI.getConnector(
        slackConnection.connectorId
      );

      if (connectorRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "connector_not_found_error",
            message: "Invalid Slack connection configuration.",
          },
        });
      }

      const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);

      const tokenResult = await oauthApi.getAccessToken({
        connectionId: connectorRes.value.connectionId,
      });

      if (tokenResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to get Slack token.",
          },
        });
      }

      const slackClient = new WebClient(tokenResult.value.access_token);
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
