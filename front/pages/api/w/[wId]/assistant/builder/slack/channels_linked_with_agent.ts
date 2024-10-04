import type { DataSourceType, WithAPIErrorResponse } from "@dust-tt/types";
import { ConnectorsAPI } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export type GetSlackChannelsLinkedWithAgentResponseBody = {
  slackChannels: {
    slackChannelId: string;
    slackChannelName: string;
    agentConfigurationId: string;
  }[];
  slackDataSource?: DataSourceType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetSlackChannelsLinkedWithAgentResponseBody>
  >,
  auth: Authenticator
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

  const [dataSource] = await DataSourceResource.listByConnectorProvider(
    auth,
    "slack"
  );

  if (!dataSource) {
    return res.status(200).json({
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
    dataSource.connectorProvider !== "slack"
  ) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "data_source_not_managed",
        message:
          "The data source you requested is not managed by a Slack connector.",
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

export default withSessionAuthenticationForWorkspace(handler);
