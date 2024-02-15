import type {
  ConnectorNode,
  ConnectorPermission,
  ConnectorsAPIError,
  ModelId,
} from "@dust-tt/types";
import { WebClient } from "@slack/web-api";
import PQueue from "p-queue";

import type {
  ConnectorConfigGetter,
  ConnectorPermissionRetriever,
} from "@connectors/connectors/interface";
import { getChannels } from "@connectors/connectors/slack//temporal/activities";
import {
  getBotEnabled,
  toggleSlackbot,
} from "@connectors/connectors/slack/bot";
import { joinChannel } from "@connectors/connectors/slack/lib/channels";
import {
  getSlackAccessToken,
  getSlackClient,
} from "@connectors/connectors/slack/lib/slack_client";
import { launchSlackSyncWorkflow } from "@connectors/connectors/slack/temporal/client.js";
import { ExternalOauthTokenError, NangoError } from "@connectors/lib/error";
import {
  SlackChannel,
  SlackConfiguration,
  SlackMessages,
} from "@connectors/lib/models/slack";
import {
  nango_client,
  nangoDeleteConnection,
} from "@connectors/lib/nango_client.js";
import type { Result } from "@connectors/lib/result.js";
import { Err, Ok } from "@connectors/lib/result.js";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { sequelizeConnection } from "@connectors/resources/storage";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import type { DataSourceConfig } from "@connectors/types/data_source_config.js";
import type { NangoConnectionId } from "@connectors/types/nango_connection_id";

const { NANGO_SLACK_CONNECTOR_ID, SLACK_CLIENT_ID, SLACK_CLIENT_SECRET } =
  process.env;

export async function createSlackConnector(
  dataSourceConfig: DataSourceConfig,
  connectionId: NangoConnectionId
): Promise<Result<string, Error>> {
  const nangoConnectionId = connectionId;

  const res = await sequelizeConnection.transaction(
    async (t): Promise<Result<ConnectorModel, Error>> => {
      const nango = nango_client();
      if (!NANGO_SLACK_CONNECTOR_ID) {
        throw new Error("NANGO_SLACK_CONNECTOR_ID is not defined");
      }
      const slackAccessToken = (await nango.getToken(
        NANGO_SLACK_CONNECTOR_ID,
        nangoConnectionId
      )) as string;
      const client = new WebClient(slackAccessToken);

      const teamInfo = await client.team.info();
      if (teamInfo.ok !== true) {
        return new Err(
          new Error(
            `Could not get slack team info. Error message: ${
              teamInfo.error || "unknown"
            }`
          )
        );
      }
      if (!teamInfo.team?.id) {
        return new Err(
          new Error(
            `Could not get slack team id. Error message: ${
              teamInfo.error || "unknown"
            }`
          )
        );
      }

      const connector = await ConnectorModel.create(
        {
          type: "slack",
          connectionId: nangoConnectionId,
          workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
          workspaceId: dataSourceConfig.workspaceId,
          dataSourceName: dataSourceConfig.dataSourceName,
        },
        { transaction: t }
      );

      const otherSlackConfigurationWithBotEnabled =
        await SlackConfiguration.findOne({
          where: {
            slackTeamId: teamInfo.team.id,
            botEnabled: true,
          },
          transaction: t,
        });

      await SlackConfiguration.create(
        {
          slackTeamId: teamInfo.team.id,
          connectorId: connector.id,
          botEnabled: otherSlackConfigurationWithBotEnabled ? false : true,
        },
        { transaction: t }
      );

      return new Ok(connector);
    }
  );

  if (res.isErr()) {
    return res;
  }

  return new Ok(res.value.id.toString());
}

export async function updateSlackConnector(
  connectorId: ModelId,
  {
    connectionId,
  }: {
    connectionId?: string | null;
  }
): Promise<Result<string, ConnectorsAPIError>> {
  if (!NANGO_SLACK_CONNECTOR_ID) {
    throw new Error("NANGO_SLACK_CONNECTOR_ID not set");
  }

  const c = await ConnectorResource.fetchById(connectorId);
  if (!c) {
    logger.error({ connectorId }, "Connector not found");
    return new Err({
      message: "Connector not found",
      type: "connector_not_found",
    });
  }

  const currentSlackConfig = await SlackConfiguration.findOne({
    where: {
      connectorId: connectorId,
    },
  });
  if (!currentSlackConfig) {
    logger.error({ connectorId }, "Slack configuration not found");
    return new Err({
      message: "Slack configuration not found",
      type: "connector_not_found",
    });
  }

  const updateParams: Parameters<typeof c.update>[0] = {};

  if (connectionId) {
    const accessToken = await getSlackAccessToken(connectionId);
    const slackClient = await getSlackClient(accessToken);
    const teamInfoRes = await slackClient.team.info();
    if (!teamInfoRes.ok || !teamInfoRes.team?.id) {
      return new Err({
        type: "internal_server_error",
        message: "Can't get the Slack team information.",
      });
    }

    const newTeamId = teamInfoRes.team.id;
    if (newTeamId !== currentSlackConfig.slackTeamId) {
      const configurations = await SlackConfiguration.findAll({
        where: {
          slackTeamId: newTeamId,
        },
      });

      // Revoke the token if no other slack connector is active on the same slackTeamId.
      if (configurations.length == 0) {
        logger.info(
          {
            connectorId: c.id,
            slackTeamId: newTeamId,
            nangoConnectionId: connectionId,
          },
          `Attempting Slack app deactivation [updateSlackConnector/team_id_mismatch]`
        );
        const uninstallRes = await uninstallSlack(connectionId);

        if (uninstallRes.isErr()) {
          return new Err({
            type: "internal_server_error",
            message: "Failed to deactivate the mismatching Slack app",
          });
        }
        logger.info(
          {
            connectorId: c.id,
            slackTeamId: newTeamId,
            nangoConnectionId: connectionId,
          },
          `Deactivated Slack app [updateSlackConnector/team_id_mismatch]`
        );
      } else {
        logger.info(
          {
            slackTeamId: newTeamId,
            activeConfigurations: configurations.length,
          },
          `Skipping deactivation of the Slack app [updateSlackConnector/team_id_mismatch]`
        );
      }

      return new Err({
        type: "connector_oauth_target_mismatch",
        message: "Cannot change the Slack Team of a Data Source",
      });
    }

    updateParams.connectionId = connectionId;
  }

  await c.update(updateParams);

  return new Ok(c.id.toString());
}

export async function uninstallSlack(nangoConnectionId: string) {
  if (!NANGO_SLACK_CONNECTOR_ID) {
    throw new Error("NANGO_SLACK_CONNECTOR_ID is not defined");
  }
  if (!SLACK_CLIENT_ID) {
    throw new Error("SLACK_CLIENT_ID is not defined");
  }
  if (!SLACK_CLIENT_SECRET) {
    throw new Error("SLACK_CLIENT_SECRET is not defined");
  }

  try {
    const slackAccessToken = await getSlackAccessToken(nangoConnectionId);
    const slackClient = await getSlackClient(slackAccessToken);
    await slackClient.auth.test();
    const deleteRes = await slackClient.apps.uninstall({
      client_id: SLACK_CLIENT_ID,
      client_secret: SLACK_CLIENT_SECRET,
    });
    if (deleteRes && !deleteRes.ok) {
      return new Err(
        new Error(
          `Could not uninstall the Slack app from the user's workspace. Error: ${deleteRes.error}`
        )
      );
    }
  } catch (e) {
    if (e instanceof NangoError && e.type === "unknown_connection") {
      logger.info(
        {
          nangoConnectionId,
          error: `Nango error: unknown connection: ${e.message}`,
        },
        "Unknown nango connection, skipping uninstallation of the Slack app"
      );
      return new Ok(undefined);
    } else if (e instanceof ExternalOauthTokenError) {
      logger.info(
        {
          nangoConnectionId,
        },
        `Slack auth is invalid, skipping uninstallation of the Slack app`
      );
    } else {
      throw e;
    }
  }

  const nangoRes = await nangoDeleteConnection(
    nangoConnectionId,
    NANGO_SLACK_CONNECTOR_ID
  );
  if (nangoRes.isErr()) {
    return nangoRes;
  }
  logger.info({ nangoConnectionId }, `Deactivated the Slack app`);

  return new Ok(undefined);
}

export async function cleanupSlackConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(
      new Error(`Could not find connector with id ${connectorId}`)
    );
  }

  return sequelizeConnection.transaction(async (transaction) => {
    const configuration = await SlackConfiguration.findOne({
      where: {
        connectorId: connectorId,
      },
      transaction,
    });
    if (!configuration) {
      return new Err(
        new Error(
          `Could not find configuration for connector id ${connectorId}`
        )
      );
    }

    const configurations = await SlackConfiguration.findAll({
      where: {
        slackTeamId: configuration.slackTeamId,
      },
      transaction,
    });

    // We deactivate our connections only if we are the only live slack connection for this team.
    if (configurations.length == 1) {
      logger.info(
        {
          connectorId: connector.id,
          slackTeamId: configuration.slackTeamId,
          nangoConnectionId: connector.connectionId,
        },
        `Attempting Slack app deactivation [cleanupSlackConnector]`
      );

      const uninstallRes = await uninstallSlack(connector.connectionId);
      if (uninstallRes.isErr()) {
        return uninstallRes;
      }

      logger.info(
        {
          connectorId: connector.id,
          slackTeamId: configuration.slackTeamId,
        },
        `Deactivated Slack app [cleanupSlackConnector]`
      );
    } else {
      logger.info(
        {
          connectorId: connector.id,
          slackTeamId: configuration.slackTeamId,
          activeConfigurations: configurations.length - 1,
        },
        `Skipping deactivation of the Slack app [cleanupSlackConnector]`
      );
    }

    await SlackChannel.destroy({
      where: {
        connectorId: connectorId,
      },
      transaction,
    });
    await SlackMessages.destroy({
      where: {
        connectorId: connectorId,
      },
      transaction,
    });
    await SlackConfiguration.destroy({
      where: {
        connectorId: connectorId,
      },
      transaction,
    });

    await connector.delete(transaction);

    return new Ok(undefined);
  });
}

export async function retrieveSlackConnectorPermissions({
  connectorId,
  parentInternalId,
  filterPermission,
}: Parameters<ConnectorPermissionRetriever>[0]): Promise<
  Result<ConnectorNode[], Error>
> {
  if (parentInternalId) {
    return new Err(
      new Error(
        "Slack connector does not support permission retrieval with `parentInternalId`"
      )
    );
  }

  const c = await ConnectorResource.fetchById(connectorId);
  if (!c) {
    logger.error({ connectorId }, "Connector not found");
    return new Err(new Error("Connector not found"));
  }
  const slackConfig = await SlackConfiguration.findOne({
    where: {
      connectorId: connectorId,
    },
  });
  if (!slackConfig) {
    logger.error({ connectorId }, "Slack configuration not found");
    return new Err(new Error("Slack configuration not found"));
  }

  let permissionToFilter: ConnectorPermission[] = [];

  switch (filterPermission) {
    case "read":
      permissionToFilter = ["read", "read_write"];
      break;
    case "write":
      permissionToFilter = ["write", "read_write"];
      break;
    case "read_write":
      permissionToFilter = ["read_write"];
      break;
  }

  const slackChannels: {
    slackChannelId: string;
    slackChannelName: string;
    permission: ConnectorPermission;
  }[] = [];

  const [remoteChannels, localChannels] = await Promise.all([
    getChannels(c.id, false),
    SlackChannel.findAll({
      where: {
        connectorId: connectorId,
      },
    }),
  ]);
  const localChannelsById = localChannels.reduce((acc, ch) => {
    acc[ch.slackChannelId] = ch;
    return acc;
  }, {} as Record<string, SlackChannel>);

  for (const remoteChannel of remoteChannels) {
    if (!remoteChannel.id || !remoteChannel.name) {
      continue;
    }

    const permissions =
      localChannelsById[remoteChannel.id]?.permission ||
      (remoteChannel.is_member ? "write" : "none");

    if (
      permissionToFilter.length === 0 ||
      permissionToFilter.includes(permissions)
    ) {
      slackChannels.push({
        slackChannelId: remoteChannel.id,
        slackChannelName: remoteChannel.name,
        permission: permissions,
      });
    }
  }

  const resources: ConnectorNode[] = slackChannels.map((ch) => ({
    provider: "slack",
    internalId: ch.slackChannelId,
    parentInternalId: null,
    type: "channel",
    title: `#${ch.slackChannelName}`,
    sourceUrl: `https://app.slack.com/client/${slackConfig.slackTeamId}/${ch.slackChannelId}`,
    expandable: false,
    permission: ch.permission,
    dustDocumentId: null,
    lastUpdatedAt: null,
  }));

  resources.sort((a, b) => {
    return a.title.localeCompare(b.title);
  });

  return new Ok(resources);
}

export async function setSlackConnectorPermissions(
  connectorId: ModelId,
  permissions: Record<string, ConnectorPermission>
): Promise<Result<void, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector not found with id ${connectorId}`));
  }

  const configuration = await SlackConfiguration.findOne({
    where: {
      connectorId: connectorId,
    },
  });
  if (!configuration) {
    return new Err(
      new Error(`Could not find configuration for connector id ${connectorId}`)
    );
  }

  const channels = (
    await SlackChannel.findAll({
      where: {
        connectorId: connectorId,
        slackChannelId: Object.keys(permissions),
      },
    })
  ).reduce(
    (acc, c) => Object.assign(acc, { [c.slackChannelId]: c }),
    {} as {
      [key: string]: SlackChannel;
    }
  );

  const q = new PQueue({ concurrency: 10 });
  const promises: Promise<void>[] = [];

  const slackChannelsToSync: string[] = [];
  for (const [id, permission] of Object.entries(permissions)) {
    let channel = channels[id];
    const slackClient = await getSlackClient(connector.id);
    if (!channel) {
      const remoteChannel = await slackClient.conversations.info({
        channel: id,
      });
      if (!remoteChannel.ok || !remoteChannel.channel?.name) {
        logger.error(
          {
            connectorId,
            channelId: id,
            error: remoteChannel.error,
          },
          "Could not get the Slack channel information"
        );
        return new Err(
          new Error("Could not get the Slack channel information.")
        );
      }
      const joinRes = await joinChannel(connectorId, id);
      if (joinRes.isErr()) {
        return new Err(
          new Error(
            `Our Slack bot (@Dust) was not able to join the Slack channel #${remoteChannel.channel.name}. Please re-authorize Slack or invite @Dust from #${remoteChannel.channel.name} on Slack.`
          )
        );
      }
      const slackChannel = await SlackChannel.create({
        connectorId: connectorId,
        slackChannelId: id,
        slackChannelName: remoteChannel.channel.name,
        permission: "none",
      });
      channels[id] = slackChannel;
      channel = slackChannel;
    }

    promises.push(
      q.add(async () => {
        if (!channel) {
          return;
        }
        const oldPermission = channel.permission;
        if (oldPermission === permission) {
          return;
        }
        await channel.update({
          permission: permission,
        });

        if (
          !["read", "read_write"].includes(oldPermission) &&
          ["read", "read_write"].includes(permission)
        ) {
          // handle read permission enabled
          slackChannelsToSync.push(channel.slackChannelId);
          const joinChannelRes = await joinChannel(
            connectorId,
            channel.slackChannelId
          );
          if (joinChannelRes.isErr()) {
            throw new Error(
              `Our Slack bot (@Dust) was not able to join the Slack channel #${channel.slackChannelName}. Please re-authorize Slack or invite @Dust from #${channel.slackChannelName} on Slack.`
            );
          }
        }
      })
    );
  }

  try {
    await Promise.all(promises);
    const workflowRes = await launchSlackSyncWorkflow(
      connectorId,
      null,
      slackChannelsToSync
    );

    if (workflowRes.isErr()) {
      return new Err(workflowRes.error);
    }
  } catch (e) {
    return new Err(e as Error);
  }

  return new Ok(undefined);
}

export async function retrieveSlackChannelsTitles(
  connectorId: ModelId,
  internalIds: string[]
): Promise<Result<Record<string, string>, Error>> {
  const channels = await SlackChannel.findAll({
    where: {
      connectorId: connectorId,
      slackChannelId: internalIds,
    },
  });

  const titles: Record<string, string> = {};
  for (const ch of channels) {
    titles[ch.slackChannelId] = ch.slackChannelName;
  }

  return new Ok(titles);
}

export const getSlackConfig: ConnectorConfigGetter = async function (
  connectorId: ModelId,
  configKey: string
) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector not found with id ${connectorId}`));
  }

  switch (configKey) {
    case "botEnabled": {
      const botEnabledRes = await getBotEnabled(connectorId);
      if (botEnabledRes.isErr()) {
        return botEnabledRes;
      }
      return new Ok(botEnabledRes.value.toString());
    }
    default:
      return new Err(new Error(`Invalid config key ${configKey}`));
  }
};

export async function setSlackConfig(
  connectorId: ModelId,
  configKey: string,
  configValue: string
) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector not found with id ${connectorId}`));
  }

  switch (configKey) {
    case "botEnabled": {
      const res = await toggleSlackbot(connectorId, configValue === "true");
      return res;
    }

    default: {
      return new Err(new Error(`Invalid config key ${configKey}`));
    }
  }
}
