import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type {
  ConnectorProvider,
  DataSourceType,
  WithAPIErrorResponse,
} from "@app/types";
import { ConnectorsAPI } from "@app/types";

export type GetSlackChannelsLinkedWithAgentResponseBody = {
  provider: Extract<ConnectorProvider, "slack" | "slack_bot">;
  slackChannels: {
    slackChannelId: string;
    slackChannelName: string;
    agentConfigurationId: string;
    autoRespondWithoutMention: boolean;
  }[];
  slackDataSource?: DataSourceType;
};

export async function handleSlackChannelsLinkedWithAgent(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetSlackChannelsLinkedWithAgentResponseBody>
  >,
  auth: Authenticator,
  connectorProvider: Extract<ConnectorProvider, "slack" | "slack_bot">
): Promise<void> {
  if (!auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message:
          "Only the users that are `builders` for the current workspace can modify linked Slack channels.",
      },
    });
  }

  const [[dataSourceSlack], [dataSourceSlackBot]] = await Promise.all([
    DataSourceResource.listByConnectorProvider(auth, "slack"),
    DataSourceResource.listByConnectorProvider(auth, "slack_bot"),
  ]);
  let isSlackBotEnabled = false;
  if (dataSourceSlackBot && dataSourceSlackBot.connectorId) {
    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const configRes = await connectorsAPI.getConnectorConfig(
      dataSourceSlackBot.connectorId,
      "botEnabled"
    );
    if (configRes.isOk()) {
      isSlackBotEnabled = configRes.value.configValue === "true";
    }
  }

  const provider = isSlackBotEnabled ? "slack_bot" : "slack";
  const dataSource = isSlackBotEnabled ? dataSourceSlackBot : dataSourceSlack;

  if (!dataSource) {
    return res.status(200).json({
      provider,
      slackChannels: [],
      slackDataSource: undefined,
    });
  }

  if (!dataSource.connectorId) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "data_source_not_managed",
        message: "The data source you requested is not managed.",
      },
    });
  }

  if (
    !dataSource.connectorProvider ||
    (dataSource.connectorProvider !== "slack_bot" &&
      dataSource.connectorProvider !== "slack")
  ) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "data_source_not_managed",
        message: `The data source you requested is not managed by a ${connectorProvider} connector.`,
      },
    });
  }

  switch (req.method) {
    case "GET":
      const connectorsAPI = new ConnectorsAPI(
        config.getConnectorsAPIConfig(),
        logger
      );
      const linkedSlackChannelsRes =
        await connectorsAPI.getSlackChannelsLinkedWithAgent({
          connectorId: dataSource.connectorId,
        });

      if (linkedSlackChannelsRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `An error occurred while fetching the linked Slack channels.`,
          },
        });
      }

      res.status(200).json({
        provider,
        slackChannels: linkedSlackChannelsRes.value.slackChannels,
        slackDataSource: dataSource.toJSON(),
      });

      break;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetSlackChannelsLinkedWithAgentResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  return handleSlackChannelsLinkedWithAgent(req, res, auth, "slack");
}

export default withSessionAuthenticationForWorkspace(handler);
