import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { ConnectorsAPI } from "@app/types";
import type { SlackLabsConfigurationType } from "@app/types/connectors/slack_labs";
import { SlackLabsConfigurationTypeSchema } from "@app/types/connectors/slack_labs";

async function getSlackLabsConnector(
  auth: Authenticator,
  connectorsAPI: ConnectorsAPI
): Promise<{
  id: string;
  dataSourceId: string;
  connectionId: string;
  configuration: SlackLabsConfigurationType;
} | null> {
  try {
    const [slackLabsDataSource] =
      await DataSourceResource.listByConnectorProvider(auth, "slack_labs");

    if (!slackLabsDataSource || !slackLabsDataSource.connectorId) {
      return null;
    }

    // Get connector details via ConnectorsAPI
    const connectorRes = await connectorsAPI.getConnector(
      slackLabsDataSource.connectorId
    );
    if (connectorRes.isErr()) {
      logger.error(
        {
          error: connectorRes.error,
          connectorId: slackLabsDataSource.connectorId,
        },
        "Failed to fetch slack_labs connector"
      );
      return null;
    }

    return {
      id: connectorRes.value.id,
      dataSourceId: connectorRes.value.dataSourceId,
      connectionId: connectorRes.value.connectionId,
      configuration: connectorRes.value
        .configuration as SlackLabsConfigurationType,
    };
  } catch (error) {
    logger.error({ error }, "Error fetching slack_labs connector");
    return null;
  }
}

const SlackConnectionSchema = t.type({
  connectionId: t.string,
});

// Validation helpers
function isValidSlackChannelId(channelId: string): boolean {
  return (
    /^[a-zA-Z0-9_-]+$/.test(channelId) &&
    channelId.length >= 1 &&
    channelId.length <= 80
  );
}

function isValidAgentConfigurationId(agentId: string): boolean {
  return (
    /^[a-zA-Z0-9_-]+$/.test(agentId) &&
    agentId.length >= 1 &&
    agentId.length <= 255
  );
}

export type SlackChannelAgentConfiguration = {
  connectionId: string | null;
  slackTeamId: string | null;
  channelId: string | null;
  agentConfigurationId: string | null;
  connectorId: string | null;
  isEnabled: boolean;
};

export type GetSlackChannelAgentConfigurationResponseBody = {
  configuration: SlackChannelAgentConfiguration | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetSlackChannelAgentConfigurationResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();
  const flags = await getFeatureFlags(owner);

  if (!flags.includes("labs_slack_channel_agent")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "feature_flag_not_found",
        message: "The feature is not enabled for this workspace.",
      },
    });
  }

  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "invalid_request_error",
        message: "You are not authorized to access this resource.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const connectorsAPI = new ConnectorsAPI(
        config.getConnectorsAPIConfig(),
        logger
      );
      const connector = await getSlackLabsConnector(auth, connectorsAPI);
      if (!connector) {
        return res.status(200).json({ configuration: null });
      }

      const slackTeamIdRes = await connectorsAPI.getConnectorConfig(
        connector.id,
        "slackTeamId"
      );
      const slackTeamId = slackTeamIdRes.isOk()
        ? slackTeamIdRes.value.configValue
        : null;

      const cfg: SlackChannelAgentConfiguration = {
        connectionId: connector.connectionId,
        slackTeamId,
        channelId: connector.configuration.channelId || null,
        agentConfigurationId:
          connector.configuration.agentConfigurationId || null,
        connectorId: connector.id,
        isEnabled: connector.configuration.isEnabled,
      };

      return res.status(200).json({ configuration: cfg });
    }

    case "POST": {
      const decoded = SlackConnectionSchema.decode(req.body);
      if (isLeft(decoded)) {
        const pathError = reporter.formatValidationErrors(decoded.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const { connectionId } = decoded.right;
      if (!connectionId || !connectionId.startsWith("con_")) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Invalid or missing connectionId. Please complete Slack OAuth and retry.",
          },
        });
      }
      const connectorsAPI = new ConnectorsAPI(
        config.getConnectorsAPIConfig(),
        logger
      );

      // Check if connector already exists
      const existingConnector = await getSlackLabsConnector(
        auth,
        connectorsAPI
      );

      if (existingConnector) {
        // Connector exists - check if it needs update for reconnection
        if (existingConnector.connectionId !== connectionId) {
          // Update the connector with new connection
          logger.info(
            {
              connectorId: existingConnector.id,
              oldConnectionId: existingConnector.connectionId,
              newConnectionId: connectionId,
            },
            "Updating slack_labs connector connection"
          );

          const updateRes = await connectorsAPI.updateConnector({
            connectorId: existingConnector.id,
            connectionId,
          });

          if (updateRes.isErr()) {
            logger.error(
              { error: updateRes.error },
              "Failed to update connector connection"
            );
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: "Failed to update connector connection",
              },
            });
          }
        }

        const slackTeamIdRes = await connectorsAPI.getConnectorConfig(
          existingConnector.id,
          "slackTeamId"
        );
        const slackTeamId = slackTeamIdRes.isOk()
          ? slackTeamIdRes.value.configValue
          : null;

        const cfg: SlackChannelAgentConfiguration = {
          connectionId,
          slackTeamId,
          channelId: existingConnector.configuration.channelId || null,
          agentConfigurationId:
            existingConnector.configuration.agentConfigurationId || null,
          connectorId: existingConnector.id,
          isEnabled: existingConnector.configuration.isEnabled,
        };
        return res.status(200).json({ configuration: cfg });
      }

      try {
        logger.info(
          {
            workspaceId: owner.sId,
            connectionId,
          },
          "Creating slack_labs DataSource and connector"
        );

        const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);
        if (!systemSpace) {
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "Failed to fetch space",
            },
          });
        }

        const response = await fetch(
          `${config.getClientFacingUrl()}/api/w/${owner.sId}/spaces/${systemSpace.sId}/data_sources`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Cookie: req.headers.cookie || "",
            },
            body: JSON.stringify({
              provider: "slack_labs",
              connectionId: connectionId,
              name: undefined,
              configuration: {
                channelId: "",
                agentConfigurationId: "",
                isEnabled: false,
              },
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          logger.error(
            { error: errorData },
            "Failed to create slack_labs data source"
          );
          return apiError(req, res, {
            status_code: response.status,
            api_error: {
              type: "internal_server_error",
              message: `Failed to create data source: ${errorData.error?.message || "Unknown error"}`,
            },
          });
        }

        const dataSourceData = await response.json();
        logger.info(
          {
            dataSourceId: dataSourceData.dataSource?.sId,
            workspaceId: owner.sId,
          },
          "Successfully created slack_labs DataSource and connector"
        );

        // Return the new configuration
        const cfg: SlackChannelAgentConfiguration = {
          connectionId,
          slackTeamId: null,
          channelId: "",
          agentConfigurationId: "",
          connectorId: dataSourceData.dataSource?.connectorId || null,
          isEnabled: false,
        };
        return res.status(200).json({ configuration: cfg });
      } catch (error) {
        logger.error({ error }, "Failed to create slack_labs connector");
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to communicate with connectors service",
          },
        });
      }
    }

    case "PUT": {
      const decoded = SlackLabsConfigurationTypeSchema.decode(req.body);
      if (isLeft(decoded)) {
        const pathError = reporter.formatValidationErrors(decoded.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const { channelId, agentConfigurationId, isEnabled } = decoded.right;

      // Validate inputs
      if (!isValidSlackChannelId(channelId)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Invalid channelId: must be 1-80 alphanumeric characters, underscores, or hyphens",
          },
        });
      }

      if (!isValidAgentConfigurationId(agentConfigurationId)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Invalid agentConfigurationId: must be 1-255 alphanumeric characters, underscores, or hyphens",
          },
        });
      }

      const connectorsAPI = new ConnectorsAPI(
        config.getConnectorsAPIConfig(),
        logger
      );
      const connector = await getSlackLabsConnector(auth, connectorsAPI);

      if (!connector) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "No Slack Labs connector found. Please reconnect to Slack to establish the connection first.",
          },
        });
      }
      const configUpdates = [
        { key: "channelId", value: channelId },
        { key: "agentConfigurationId", value: agentConfigurationId },
        { key: "isEnabled", value: isEnabled.toString() },
      ];

      for (const { key, value } of configUpdates) {
        const updateRes = await connectorsAPI.setConnectorConfig(
          connector.id,
          key,
          value
        );

        if (updateRes.isErr()) {
          logger.error(
            { error: updateRes.error, configKey: key },
            "Failed to update connector configuration key"
          );
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: `Failed to update configuration key ${key}`,
              connectors_error: updateRes.error,
            },
          });
        }
      }

      logger.info(
        {
          channelId,
          agentConfigurationId,
          connectorId: connector.id,
          isEnabled,
        },
        "Successfully updated slack_labs configuration"
      );

      const slackTeamIdRes = await connectorsAPI.getConnectorConfig(
        connector.id,
        "slackTeamId"
      );
      const slackTeamId = slackTeamIdRes.isOk()
        ? slackTeamIdRes.value.configValue
        : null;

      const cfg: SlackChannelAgentConfiguration = {
        connectionId: connector.connectionId,
        slackTeamId,
        channelId,
        agentConfigurationId,
        connectorId: connector.id,
        isEnabled,
      };
      return res.status(200).json({ configuration: cfg });
    }
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
