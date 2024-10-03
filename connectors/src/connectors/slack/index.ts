import type {
  ConnectorPermission,
  ConnectorsAPIError,
  ContentNode,
  ModelId,
  Result,
  SlackConfigurationType,
} from "@dust-tt/types";
import type { ContentNodesViewType } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { WebClient } from "@slack/web-api";
import PQueue from "p-queue";

import type { ConnectorManagerError } from "@connectors/connectors/interface";
import { BaseConnectorManager } from "@connectors/connectors/interface";
import { getChannels } from "@connectors/connectors/slack//temporal/activities";
import { getBotEnabled } from "@connectors/connectors/slack/bot";
import { joinChannel } from "@connectors/connectors/slack/lib/channels";
import {
  getSlackAccessToken,
  getSlackClient,
} from "@connectors/connectors/slack/lib/slack_client";
import { launchSlackSyncWorkflow } from "@connectors/connectors/slack/temporal/client.js";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import { SlackChannel } from "@connectors/lib/models/slack";
import { terminateAllWorkflowsForConnectorId } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config.js";

const { SLACK_CLIENT_ID, SLACK_CLIENT_SECRET } = process.env;

export class SlackConnectorManager extends BaseConnectorManager<SlackConfigurationType> {
  static async create({
    dataSourceConfig,
    connectionId,
    configuration,
  }: {
    dataSourceConfig: DataSourceConfig;
    connectionId: string;
    configuration: SlackConfigurationType;
  }): Promise<Result<string, ConnectorManagerError>> {
    const slackAccessToken = await getSlackAccessToken(connectionId);

    const client = new WebClient(slackAccessToken);

    const teamInfo = await client.team.info();
    if (teamInfo.ok !== true) {
      throw new Error(
        `Could not get slack team info. Error message: ${
          teamInfo.error || "unknown"
        }`
      );
    }
    if (!teamInfo.team?.id) {
      throw new Error(
        `Could not get slack team id. Error message: ${
          teamInfo.error || "unknown"
        }`
      );
    }
    const connector = await ConnectorResource.makeNew(
      "slack",
      {
        connectionId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
      },
      {
        slackTeamId: teamInfo.team.id,
        botEnabled: configuration.botEnabled,
        autoReadChannelPattern: configuration.autoReadChannelPattern,
        whitelistedDomains: configuration.whitelistedDomains,
      }
    );

    return new Ok(connector.id.toString());
  }

  async update({
    connectionId,
  }: {
    connectionId?: string | null;
  }): Promise<Result<string, ConnectorsAPIError>> {
    const c = await ConnectorResource.fetchById(this.connectorId);
    if (!c) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
      return new Err({
        message: "Connector not found",
        type: "connector_not_found",
      });
    }

    const currentSlackConfig =
      await SlackConfigurationResource.fetchByConnectorId(this.connectorId);
    if (!currentSlackConfig) {
      logger.error(
        { connectorId: this.connectorId },
        "Slack configuration not found"
      );
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
        const configurations =
          await SlackConfigurationResource.listForTeamId(newTeamId);

        // Revoke the token if no other slack connector is active on the same slackTeamId.
        if (configurations.length == 0) {
          logger.info(
            {
              connectorId: c.id,
              slackTeamId: newTeamId,
              connectionId: connectionId,
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
              connectionId: connectionId,
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

  async clean({
    force,
  }: {
    force: boolean;
  }): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Could not find connector with id ${this.connectorId}`)
      );
    }

    const configuration = await SlackConfigurationResource.fetchByConnectorId(
      this.connectorId
    );
    if (!configuration) {
      return new Err(
        new Error(
          `Could not find configuration for connector id ${this.connectorId}`
        )
      );
    }

    const configurations = await SlackConfigurationResource.listForTeamId(
      configuration.slackTeamId
    );

    // We deactivate our connections only if we are the only live slack connection for this team.
    if (configurations.length == 1) {
      logger.info(
        {
          connectorId: connector.id,
          slackTeamId: configuration.slackTeamId,
          connectionId: connector.connectionId,
        },
        `Attempting Slack app deactivation [cleanupSlackConnector]`
      );

      try {
        const uninstallRes = await uninstallSlack(connector.connectionId);

        if (uninstallRes.isErr() && !force) {
          return uninstallRes;
        }
      } catch (e) {
        if (!force) {
          throw e;
        }
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

    const res = await connector.delete();
    if (res.isErr()) {
      logger.error(
        { connectorId: this.connectorId, error: res.error },
        "Error cleaning up Slack connector."
      );
      return res;
    }

    return new Ok(undefined);
  }

  async sync({
    fromTs,
  }: {
    fromTs: number | null;
  }): Promise<Result<string, Error>> {
    return launchSlackSyncWorkflow(this.connectorId, fromTs);
  }

  async retrievePermissions({
    parentInternalId,
    filterPermission,
  }: {
    parentInternalId: string | null;
    filterPermission: ConnectorPermission | null;
    viewType: ContentNodesViewType;
  }): Promise<Result<ContentNode[], Error>> {
    if (parentInternalId) {
      return new Err(
        new Error(
          "Slack connector does not support permission retrieval with `parentInternalId`"
        )
      );
    }

    const c = await ConnectorResource.fetchById(this.connectorId);
    if (!c) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
      return new Err(new Error("Connector not found"));
    }
    const slackConfig = await SlackConfigurationResource.fetchByConnectorId(
      this.connectorId
    );
    if (!slackConfig) {
      logger.error(
        { connectorId: this.connectorId },
        "Slack configuration not found"
      );
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

    try {
      if (filterPermission === "read") {
        const localChannels = await SlackChannel.findAll({
          where: {
            connectorId: this.connectorId,
            permission: permissionToFilter,
          },
        });
        slackChannels.push(
          ...localChannels.map((channel) => ({
            slackChannelId: channel.slackChannelId,
            slackChannelName: channel.slackChannelName,
            permission: channel.permission,
          }))
        );
      } else {
        const [remoteChannels, localChannels] = await Promise.all([
          getChannels(c.id, false),
          SlackChannel.findAll({
            where: {
              connectorId: this.connectorId,
            },
          }),
        ]);

        const localChannelsById = localChannels.reduce(
          (acc, ch) => {
            acc[ch.slackChannelId] = ch;
            return acc;
          },
          {} as Record<string, SlackChannel>
        );

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
      }

      const resources: ContentNode[] = slackChannels.map((ch) => ({
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
        dustTableId: null,
      }));

      resources.sort((a, b) => {
        return a.title.localeCompare(b.title);
      });

      return new Ok(resources);
    } catch (e) {
      if (e instanceof ExternalOAuthTokenError) {
        logger.error({ connectorId: this.connectorId }, "Slack token invalid");
        return new Err(
          new Error("Slack token invalid. Please re-authorize Slack.")
        );
      }
      throw e;
    }
  }

  async setPermissions({
    permissions,
  }: {
    permissions: Record<string, ConnectorPermission>;
  }): Promise<Result<void, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Connector not found with id ${this.connectorId}`)
      );
    }

    const configuration = await SlackConfigurationResource.fetchByConnectorId(
      this.connectorId
    );
    if (!configuration) {
      return new Err(
        new Error(
          `Could not find configuration for connector id ${this.connectorId}`
        )
      );
    }

    const channels = (
      await SlackChannel.findAll({
        where: {
          connectorId: this.connectorId,
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
              connectorId: this.connectorId,
              channelId: id,
              error: remoteChannel.error,
            },
            "Could not get the Slack channel information"
          );
          return new Err(
            new Error("Could not get the Slack channel information.")
          );
        }
        const joinRes = await joinChannel(this.connectorId, id);
        if (joinRes.isErr()) {
          logger.error(
            {
              connectorId: this.connectorId,
              channelId: id,
              error: joinRes.error,
            },
            "Could not join the Slack channel"
          );
          return new Err(
            new Error(
              `Our Slack bot (@Dust) was not able to join the Slack channel #${remoteChannel.channel.name}. Please re-authorize Slack or invite @Dust from #${remoteChannel.channel.name} on Slack.`
            )
          );
        }
        const slackChannel = await SlackChannel.create({
          connectorId: this.connectorId,
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
              this.connectorId,
              channel.slackChannelId
            );
            if (joinChannelRes.isErr()) {
              logger.error(
                {
                  connectorId: this.connectorId,
                  channelId: channel.slackChannelId,
                  error: joinChannelRes.error,
                },
                "Could not join the Slack channel"
              );
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
        this.connectorId,
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

  async retrieveBatchContentNodes({
    internalIds,
  }: {
    internalIds: string[];
    viewType: ContentNodesViewType;
  }): Promise<Result<ContentNode[], Error>> {
    const slackConfig = await SlackConfigurationResource.fetchByConnectorId(
      this.connectorId
    );
    if (!slackConfig) {
      logger.error(
        { connectorId: this.connectorId },
        "Slack configuration not found"
      );
      return new Err(new Error("Slack configuration not found"));
    }

    const channels = await SlackChannel.findAll({
      where: {
        connectorId: this.connectorId,
        slackChannelId: internalIds,
      },
    });

    const contentNodes: ContentNode[] = channels.map((ch) => ({
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
      dustTableId: null,
    }));

    return new Ok(contentNodes);
  }

  async retrieveContentNodeParents({
    internalId,
  }: {
    internalId: string;
  }): Promise<Result<string[], Error>> {
    return new Ok([internalId]);
  }

  async setConfigurationKey({
    configKey,
    configValue,
  }: {
    configKey: string;
    configValue: string;
  }): Promise<Result<void, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Connector not found with id ${this.connectorId}`)
      );
    }

    switch (configKey) {
      case "botEnabled": {
        const slackConfig = await SlackConfigurationResource.fetchByConnectorId(
          this.connectorId
        );
        if (!slackConfig) {
          return new Err(
            new Error(
              `Slack configuration not found for connector ${this.connectorId}`
            )
          );
        }
        if (configValue === "true") {
          return slackConfig.enableBot();
        } else {
          return slackConfig.disableBot();
        }
      }
      case "autoReadChannelPattern": {
        const slackConfig = await SlackConfigurationResource.fetchByConnectorId(
          this.connectorId
        );
        if (!slackConfig) {
          return new Err(
            new Error(
              `Slack configuration not found for connector ${this.connectorId}`
            )
          );
        }
        return slackConfig.setAutoReadChannelPattern(configValue || null);
      }

      default: {
        return new Err(new Error(`Invalid config key ${configKey}`));
      }
    }
  }

  async getConfigurationKey({
    configKey,
  }: {
    configKey: string;
  }): Promise<Result<string | null, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Connector not found with id ${this.connectorId}`)
      );
    }

    switch (configKey) {
      case "botEnabled": {
        const botEnabledRes = await getBotEnabled(this.connectorId);
        if (botEnabledRes.isErr()) {
          return botEnabledRes;
        }
        return new Ok(botEnabledRes.value.toString());
      }
      case "autoReadChannelPattern": {
        const autoReadChannelPattern = await getAutoReadChannelPattern(
          this.connectorId
        );
        return autoReadChannelPattern;
      }
      default:
        return new Err(new Error(`Invalid config key ${configKey}`));
    }
  }

  async pause(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Connector not found with id ${this.connectorId}`)
      );
    }
    await connector.markAsPaused();
    await terminateAllWorkflowsForConnectorId(this.connectorId);
    return new Ok(undefined);
  }

  async unpause(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Connector not found with id ${this.connectorId}`)
      );
    }
    await connector.markAsUnpaused();
    const r = await launchSlackSyncWorkflow(this.connectorId, null);
    if (r.isErr()) {
      return r;
    }
    return new Ok(undefined);
  }

  async stop(): Promise<Result<undefined, Error>> {
    logger.info(
      { connectorId: this.connectorId },
      `Stopping Slack connector is a no-op.`
    );
    return new Ok(undefined);
  }

  async resume(): Promise<Result<undefined, Error>> {
    logger.info(
      { connectorId: this.connectorId },
      `Resuming Slack connector is a no-op.`
    );
    return new Ok(undefined);
  }

  async garbageCollect(): Promise<Result<string, Error>> {
    throw new Error("Method not implemented.");
  }

  async configure(): Promise<Result<void, Error>> {
    throw new Error("Method not implemented.");
  }
}

export async function uninstallSlack(connectionId: string) {
  if (!SLACK_CLIENT_ID) {
    throw new Error("SLACK_CLIENT_ID is not defined");
  }
  if (!SLACK_CLIENT_SECRET) {
    throw new Error("SLACK_CLIENT_SECRET is not defined");
  }

  try {
    const slackAccessToken = await getSlackAccessToken(connectionId);
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
    if (e instanceof ExternalOAuthTokenError) {
      logger.info(
        {
          connectionId: connectionId,
        },
        `Slack auth is invalid, skipping uninstallation of the Slack app`
      );
    } else {
      throw e;
    }
  }

  logger.info({ connectionId: connectionId }, `Deactivated the Slack app`);

  return new Ok(undefined);
}

export async function getAutoReadChannelPattern(
  connectorId: ModelId
): Promise<Result<string | null, Error>> {
  const slackConfiguration =
    await SlackConfigurationResource.fetchByConnectorId(connectorId);
  if (!slackConfiguration) {
    return new Err(
      new Error(
        `Failed to find a Slack configuration for connector ${connectorId}`
      )
    );
  }
  if (!slackConfiguration.autoReadChannelPattern) {
    return new Ok(null);
  }
  return new Ok(slackConfiguration.autoReadChannelPattern);
}
