import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { ConnectorsAPI } from "@app/types";

export type PatchLinkedSlackChannelsResponseBody = {
  success: true;
};

export const PatchLinkedSlackChannelsRequestBodySchema = t.type({
  slack_channel_internal_ids: t.array(t.string),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PatchLinkedSlackChannelsResponseBody | void>
  >,
  auth: Authenticator
): Promise<void> {
  if (!auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_auth_error",
        message:
          "Only the users that are `builders` for the current workspace can access an agent.",
      },
    });
  }

  const slackDataSources = await DataSourceResource.listByConnectorProvider(
    auth,
    "slack",
    { limit: 1 }
  );
  const slackDataSource = slackDataSources[0];

  if (!slackDataSource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The Slack data source was not found.",
      },
    });
  }

  const connectorId = slackDataSource.connectorId;

  if (!connectorId) {
    throw new Error("Unreachable code: connectorId is null.");
  }

  switch (req.method) {
    case "PATCH":
      const bodyValidation = PatchLinkedSlackChannelsRequestBodySchema.decode(
        req.body
      );
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const agentConfigurationSid = req.query.aId as string;
      const agentConfiguration = await getAgentConfiguration(
        auth,
        agentConfigurationSid
      );
      if (!agentConfiguration) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message:
              "The agent configuration you're trying to modify was not found.",
          },
        });
      }
      const connectorsAPI = new ConnectorsAPI(
        config.getConnectorsAPIConfig(),
        logger
      );

      const connectorsApiRes = await connectorsAPI.linkSlackChannelsWithAgent({
        connectorId: connectorId.toString(),
        agentConfigurationId: agentConfiguration.sId,
        slackChannelInternalIds:
          bodyValidation.right.slack_channel_internal_ids,
      });

      if (connectorsApiRes.isErr()) {
        logger.error(
          connectorsApiRes.error,
          "An error occurred while linking Slack channels."
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "An error occurred while linking Slack channels.",
          },
        });
      }

      return res.status(200).json({
        success: true,
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, PATCH is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
