import type { WithAPIErrorReponse } from "@dust-tt/types";
import { ConnectorsAPI } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getSession } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetSlackChannelsLinkedWithAgentResponseBody = {
  slackChannels: {
    slackChannelId: string;
    slackChannelName: string;
    agentConfigurationId: string;
  }[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorReponse<GetSlackChannelsLinkedWithAgentResponseBody>
  >
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  const dataSource = await getDataSource(auth, req.query.name as string);
  if (!dataSource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
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

  switch (req.method) {
    case "GET":
      const connectorsAPI = new ConnectorsAPI(logger);
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

      res
        .status(200)
        .json({ slackChannels: linkedSlackChannelsRes.value.slackChannels });

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

export default withLogging(handler);
