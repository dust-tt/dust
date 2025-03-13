import type {
  ConnectorPermission,
  ContentNode,
  ContentNodesViewType,
  ModelId,
  Result,
  SlackConfigurationType,
} from "@dust-tt/types";
import {
  Err,
  isSlackAutoReadPatterns,
  MIME_TYPES,
  Ok,
  safeParseJSON,
} from "@dust-tt/types";
import { WebClient } from "@slack/web-api";
import PQueue from "p-queue";

import type {
  CreateConnectorErrorCode,
  RetrievePermissionsErrorCode,
  UpdateConnectorErrorCode,
} from "@connectors/connectors/interface";
import {
  BaseConnectorManager,
  ConnectorManagerError,
} from "@connectors/connectors/interface";
import { getChannels } from "@connectors/connectors/slack//temporal/activities";
import { getBotEnabled } from "@connectors/connectors/slack/bot";
import { joinChannel } from "@connectors/connectors/slack/lib/channels";
import {
  getSlackAccessToken,
  getSlackClient,
} from "@connectors/connectors/slack/lib/slack_client";
import {
  slackChannelIdFromInternalId,
  slackChannelInternalIdFromSlackChannelId,
} from "@connectors/connectors/slack/lib/utils";
import { launchSlackSyncWorkflow } from "@connectors/connectors/slack/temporal/client.js";
import {
  ExternalOAuthTokenError,
  ProviderWorkflowError,
} from "@connectors/lib/error";
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
  }): Promise<Result<string, ConnectorManagerError<CreateConnectorErrorCode>>> {
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
        autoReadChannelPatterns: configuration.autoReadChannelPatterns,
        botEnabled: configuration.botEnabled,
        slackTeamId: teamInfo.team.id,
        whitelistedDomains: configuration.whitelistedDomains,
      }
    );

    return new Ok(connector.id.toString());
  }

  async update({
    connectionId,
  }: {
    connectionId?: string | null;
  }): Promise<Result<string, ConnectorManagerError<UpdateConnectorErrorCode>>> {
    const c = await ConnectorResource.fetchById(this.connectorId);
    if (!c) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
      throw new Error(`Connector ${this.connectorId} not found`);
    }

    const currentSlackConfig =
      await SlackConfigurationResource.fetchByConnectorId(this.connectorId);
    if (!currentSlackConfig) {
      logger.error(
        { connectorId: this.connectorId },
        "Slack configuration not found"
      );
      throw new Error(
        `Slack configuration not found for connector ${this.connectorId}`
      );
    }

    const updateParams: Parameters<typeof c.update>[0] = {};

    if (connectionId) {
      const accessToken = await getSlackAccessToken(connectionId);
      const slackClient = await getSlackClient(accessToken);
      const teamInfoRes = await slackClient.team.info();
      if (!teamInfoRes.ok || !teamInfoRes.team?.id) {
        throw new Error("Can't get the Slack team information.");
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
            throw new Error("Failed to deactivate the mismatching Slack app");
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

        return new Err(
          new ConnectorManagerError(
            "CONNECTOR_OAUTH_TARGET_MISMATCH",
            "Cannot change the Slack Team of a Data Source"
          )
        );
      }

      updateParams.connectionId = connectionId;
    }

    await c.update(updateParams);

    // If connector was previously paused, unpause it.
    if (c.isPaused()) {
      await this.unpause();
    }

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
  }): Promise<
    Result<ContentNode[], ConnectorManagerError<RetrievePermissionsErrorCode>>
  > {
    if (parentInternalId) {
      return new Err(
        new ConnectorManagerError(
          "INVALID_PARENT_INTERNAL_ID",
          "Slack connector does not support permission retrieval with non null `parentInternalId`"
        )
      );
    }

    const c = await ConnectorResource.fetchById(this.connectorId);
    if (!c) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
      return new Err(
        new ConnectorManagerError("CONNECTOR_NOT_FOUND", "Connector not found")
      );
    }
    const slackConfig = await SlackConfigurationResource.fetchByConnectorId(
      this.connectorId
    );
    if (!slackConfig) {
      logger.error(
        { connectorId: this.connectorId },
        "Slack configuration not found"
      );
      // This is unexpected let's throw to return a 500.
      throw new Error("Slack configuration not found");
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
      private: boolean;
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
            private: channel.private,
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
              private: !!remoteChannel.is_private,
            });
          }
        }
      }

      const resources: ContentNode[] = slackChannels.map((ch) => ({
        internalId: slackChannelInternalIdFromSlackChannelId(ch.slackChannelId),
        parentInternalId: null,
        type: "folder",
        title: `#${ch.slackChannelName}`,
        sourceUrl: `https://app.slack.com/client/${slackConfig.slackTeamId}/${ch.slackChannelId}`,
        expandable: false,
        permission: ch.permission,
        lastUpdatedAt: null,
        providerVisibility: ch.private ? "private" : "public",
        mimeType: MIME_TYPES.SLACK.CHANNEL,
      }));

      resources.sort((a, b) => {
        return a.title.localeCompare(b.title);
      });

      return new Ok(resources);
    } catch (e) {
      if (e instanceof ExternalOAuthTokenError) {
        logger.error({ connectorId: this.connectorId }, "Slack token invalid");
        return new Err(
          new ConnectorManagerError(
            "EXTERNAL_OAUTH_TOKEN_ERROR",
            "Slack authorization error, please re-authorize."
          )
        );
      }
      if (e instanceof ProviderWorkflowError && e.type === "rate_limit_error") {
        logger.error(
          { connectorId: this.connectorId, error: e },
          "Slack rate limit when retrieving permissions."
        );
        return new Err(
          new ConnectorManagerError(
            "RATE_LIMIT_ERROR",
            `Slack rate limit error when retrieving content nodes.`
          )
        );
      }
      // Unanhdled error, throwing to get a 500.
      throw e;
    }
  }

  async retrieveContentNodeParents({
    internalId,
  }: {
    internalId: string;
  }): Promise<Result<string[], Error>> {
    // TODO: Implement this.
    return new Ok([internalId]);
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
          slackChannelId: Object.keys(permissions).map((k) =>
            slackChannelIdFromInternalId(k)
          ),
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
    try {
      for (const [internalId, permission] of Object.entries(permissions)) {
        const slackChannelId = slackChannelIdFromInternalId(internalId);
        let channel = channels[slackChannelId];
        const slackClient = await getSlackClient(connector.id);
        if (!channel) {
          const remoteChannel = await slackClient.conversations.info({
            channel: slackChannelId,
          });
          if (!remoteChannel.ok || !remoteChannel.channel?.name) {
            logger.error(
              {
                connectorId: this.connectorId,
                channelId: slackChannelId,
                error: remoteChannel.error,
              },
              "Could not get the Slack channel information"
            );
            return new Err(
              new Error("Could not get the Slack channel information.")
            );
          }
          const joinRes = await joinChannel(this.connectorId, slackChannelId);
          if (joinRes.isErr()) {
            logger.error(
              {
                connectorId: this.connectorId,
                channelId: slackChannelId,
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
            slackChannelId: slackChannelId,
            slackChannelName: remoteChannel.channel.name,
            permission: "none",
            private: !!remoteChannel.channel.is_private,
          });
          channels[slackChannelId] = slackChannel;
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

    switch (configKey) {
      case "botEnabled": {
        if (configValue === "true") {
          return slackConfig.enableBot();
        } else {
          return slackConfig.disableBot();
        }
      }

      case "autoReadChannelPatterns": {
        const parsedConfig = safeParseJSON(configValue);
        if (parsedConfig.isErr()) {
          return new Err(parsedConfig.error);
        }

        const autoReadChannelPatterns = parsedConfig.value;
        if (!Array.isArray(autoReadChannelPatterns)) {
          return new Err(
            new Error("autoReadChannelPatterns must be an array of objects")
          );
        }

        if (!isSlackAutoReadPatterns(autoReadChannelPatterns)) {
          return new Err(
            new Error(
              "autoReadChannelPatterns must be an array of objects with pattern and spaceId"
            )
          );
        }

        return slackConfig.setAutoReadChannelPatterns(autoReadChannelPatterns);
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

      case "autoReadChannelPatterns": {
        const autoReadChannelPatterns = await getAutoReadChannelPatterns(
          this.connectorId
        );

        return autoReadChannelPatterns;
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

export async function getAutoReadChannelPatterns(
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

  if (!slackConfiguration.autoReadChannelPatterns) {
    return new Ok(null);
  }

  return new Ok(JSON.stringify(slackConfiguration.autoReadChannelPatterns));
}
