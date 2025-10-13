import type { ConnectorProvider, Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { WebClient } from "@slack/web-api";

import type {
  CreateConnectorErrorCode,
  RetrievePermissionsErrorCode,
  UpdateConnectorErrorCode,
} from "@connectors/connectors/interface";
import {
  BaseConnectorManager,
  ConnectorManagerError,
} from "@connectors/connectors/interface";
import {
  autoReadChannel,
  findMatchingChannelPatterns,
} from "@connectors/connectors/slack/auto_read_channel";
import { getBotEnabled } from "@connectors/connectors/slack/bot";
import {
  getAllChannels,
  joinChannelWithRetries,
} from "@connectors/connectors/slack/lib/channels";
import { slackConfig } from "@connectors/connectors/slack/lib/config";
import { retrievePermissions } from "@connectors/connectors/slack/lib/retrieve_permissions";
import {
  getSlackAccessToken,
  getSlackClient,
  reportSlackUsage,
} from "@connectors/connectors/slack/lib/slack_client";
import { slackChannelIdFromInternalId } from "@connectors/connectors/slack/lib/utils";
import { launchSlackSyncWorkflow } from "@connectors/connectors/slack/temporal/client.js";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import { SlackChannel } from "@connectors/lib/models/slack";
import { terminateAllWorkflowsForConnectorId } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import type {
  ConnectorPermission,
  ContentNode,
  DataSourceConfig,
  ModelId,
  SlackConfigurationType,
} from "@connectors/types";
import {
  concurrentExecutor,
  isSlackAutoReadPatterns,
  normalizeError,
  safeParseJSON,
} from "@connectors/types";

export class SlackConnectorManager extends BaseConnectorManager<SlackConfigurationType> {
  readonly provider: ConnectorProvider = "slack";

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
        restrictedSpaceAgentsEnabled:
          configuration.restrictedSpaceAgentsEnabled ?? true,
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

      reportSlackUsage({
        connectorId: c.id,
        method: "team.info",
      });
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
          const uninstallRes = await uninstallSlack(
            connectionId,
            slackConfig.getRequiredSlackClientId(),
            slackConfig.getRequiredSlackClientSecret()
          );

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
      await this.unpauseAndResume();
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
        const uninstallRes = await uninstallSlack(
          connector.connectionId,
          slackConfig.getRequiredSlackClientId(),
          slackConfig.getRequiredSlackClientSecret()
        );

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
  }): Promise<
    Result<ContentNode[], ConnectorManagerError<RetrievePermissionsErrorCode>>
  > {
    return retrievePermissions({
      connectorId: this.connectorId,
      parentInternalId,
      filterPermission,
      getFilteredChannels,
    });
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

    const slackChannelsToSync: string[] = [];

    try {
      // Prepare permission entries for concurrent processing
      const permissionEntries = Object.entries(permissions);

      // First, ensure all channels exist (sequential to avoid race conditions)
      for (const [internalId] of permissionEntries) {
        const slackChannelId = slackChannelIdFromInternalId(internalId);
        const channel = channels[slackChannelId];
        if (!channel) {
          const joinRes = await joinChannelWithRetries(
            this.connectorId,
            slackChannelId
          );
          if (joinRes.isErr()) {
            return new Err(joinRes.error);
          }
          const channelInfo = joinRes.value.channel;
          if (!channelInfo.name) {
            // Checked in the joinChannel function.
            throw new Error(
              `Could not get the Slack channel name for #${slackChannelId}.`
            );
          }
          const slackChannel = await SlackChannel.create({
            connectorId: this.connectorId,
            slackChannelId: slackChannelId,
            slackChannelName: channelInfo.name,
            permission: "none",
            private: !!channelInfo.is_private,
          });
          channels[slackChannelId] = slackChannel;
        }
      }

      await concurrentExecutor(
        permissionEntries,
        async ([internalId, permission]) => {
          const slackChannelId = slackChannelIdFromInternalId(internalId);
          const channel = channels[slackChannelId];

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
            const joinChannelRes = await joinChannelWithRetries(
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
        },
        { concurrency: 10 }
      );
      const workflowRes = await launchSlackSyncWorkflow(
        this.connectorId,
        null,
        slackChannelsToSync
      );

      if (workflowRes.isErr()) {
        return new Err(workflowRes.error);
      }
    } catch (e) {
      return new Err(normalizeError(e));
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

        const existingAutoReadChannelPatterns = new Set(
          slackConfig.autoReadChannelPatterns.map((p) => p.pattern)
        );
        const newAutoReadChannelPatterns = new Set(
          autoReadChannelPatterns.map((p) => p.pattern)
        );

        const addedAutoReadChannelPatterns = autoReadChannelPatterns.filter(
          (item) => !existingAutoReadChannelPatterns.has(item.pattern)
        );
        const removedAutoReadChannelPatterns =
          slackConfig.autoReadChannelPatterns.filter(
            (item) => !newAutoReadChannelPatterns.has(item.pattern)
          );

        if (
          addedAutoReadChannelPatterns.length === 0 &&
          removedAutoReadChannelPatterns.length === 0
        ) {
          return new Ok(undefined);
        }

        const res = await slackConfig.setAutoReadChannelPatterns(
          autoReadChannelPatterns
        );

        if (res.isErr()) {
          return res;
        }

        if (addedAutoReadChannelPatterns.length === 0) {
          return res;
        }

        // Check matching channels.
        const slackClient = await getSlackClient(connector.id);

        // Fetch all channels from Slack
        const allChannels = await getAllChannels(slackClient, connector.id);

        const results: Result<boolean, Error>[] = [];

        // Filter channels that match any new pattern
        const matchingChannels = allChannels.filter((channel) => {
          const channelName = channel.name;
          if (!channelName) {
            return false;
          }

          const matchingPatterns = findMatchingChannelPatterns(
            channelName,
            addedAutoReadChannelPatterns
          );
          return matchingPatterns.length > 0;
        });

        await concurrentExecutor(
          matchingChannels,
          async (channel) => {
            try {
              if (channel.id) {
                results.push(
                  await autoReadChannel(
                    slackConfig.slackTeamId,
                    logger,
                    channel.id,
                    connector.type as "slack" | "slack_bot"
                  )
                );
              }
            } catch (error) {
              results.push(new Err(normalizeError(error)));
            }
          },
          { concurrency: 10 }
        );

        for (const result of results) {
          if (result.isErr()) {
            return result;
          }
        }

        return res;
      }

      case "restrictedSpaceAgentsEnabled": {
        const enabled = configValue === "true";
        await slackConfig.model.update(
          { restrictedSpaceAgentsEnabled: enabled },
          { where: { id: slackConfig.id } }
        );
        return new Ok(undefined);
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

      case "restrictedSpaceAgentsEnabled": {
        const restrictedSpaceAgentsEnabled =
          await getRestrictedSpaceAgentsEnabled(this.connectorId);
        return restrictedSpaceAgentsEnabled;
      }

      default:
        return new Err(new Error(`Invalid config key ${configKey}`));
    }
  }

  async stop(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Connector not found with id ${this.connectorId}`)
      );
    }

    await terminateAllWorkflowsForConnectorId(this.connectorId);

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

export async function uninstallSlack(
  connectionId: string,
  slackClientId: string | undefined,
  slackClientSecret: string | undefined
) {
  if (!slackClientId) {
    throw new Error("SLACK_CLIENT_ID is not defined");
  }
  if (!slackClientSecret) {
    throw new Error("SLACK_CLIENT_SECRET is not defined");
  }

  try {
    const slackAccessToken = await getSlackAccessToken(connectionId);
    const slackClient = await getSlackClient(slackAccessToken);
    reportSlackUsage({
      connectorId: Number(connectionId),
      method: "auth.test",
    });
    await slackClient.auth.test();
    reportSlackUsage({
      connectorId: Number(connectionId),
      method: "apps.uninstall",
    });
    const deleteRes = await slackClient.apps.uninstall({
      client_id: slackClientId,
      client_secret: slackClientSecret,
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

export async function getRestrictedSpaceAgentsEnabled(
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

  return new Ok(slackConfiguration.restrictedSpaceAgentsEnabled.toString());
}

async function getFilteredChannels(
  connectorId: number,
  filterPermission: ConnectorPermission | null
) {
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

  if (filterPermission === "read") {
    const localChannels = await SlackChannel.findAll({
      where: {
        connectorId,
        permission: permissionToFilter,
        skipReason: null, // We hide skipped channels from the UI.
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
    const slackClient = await getSlackClient(connectorId);

    const [remoteChannels, localChannels] = await Promise.all([
      getAllChannels(slackClient, connectorId),
      SlackChannel.findAll({
        where: {
          connectorId,
          // Here we do not filter out channels with skipReason because we need to know the ones that are skipped.
        },
      }),
    ]);

    const localChannelsById = localChannels.reduce(
      (acc: Record<string, SlackChannel>, ch: SlackChannel) => {
        acc[ch.slackChannelId] = ch;
        return acc;
      },
      {} as Record<string, SlackChannel>
    );

    for (const remoteChannel of remoteChannels) {
      if (!remoteChannel.id || !remoteChannel.name) {
        continue;
      }

      const localChannel = localChannelsById[remoteChannel.id];

      // Skip channels with skipReason
      if (localChannel?.skipReason) {
        continue;
      }

      const permissions =
        localChannel?.permission ||
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
  return slackChannels;
}
