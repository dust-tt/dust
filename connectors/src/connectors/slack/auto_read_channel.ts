import type {
  ConnectorProvider,
  DataSourceViewType,
  Result,
} from "@dust-tt/client";
import { DustAPI, Err, Ok } from "@dust-tt/client";

import {
  getSlackClient,
  reportSlackUsage,
} from "@connectors/connectors/slack/lib/slack_client";
import {
  getSlackChannelSourceUrl,
  slackChannelInternalIdFromSlackChannelId,
} from "@connectors/connectors/slack/lib/utils";
import { launchSlackJoinChannelsWorkflowAndWait } from "@connectors/connectors/slack/temporal/client";
import { apiConfig } from "@connectors/lib/api/config";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import { SlackChannel } from "@connectors/lib/models/slack";
import type { Logger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import type { SlackAutoReadPattern } from "@connectors/types";
import {
  INTERNAL_MIME_TYPES,
  normalizeError,
  withRetries,
} from "@connectors/types";

export function findMatchingChannelPatterns(
  remoteChannelName: string,
  autoReadChannelPatterns: SlackAutoReadPattern[]
): SlackAutoReadPattern[] {
  return autoReadChannelPatterns.filter((pattern) => {
    const regex = new RegExp(`^${pattern.pattern}$`);
    return regex.test(remoteChannelName);
  });
}

export async function autoReadChannel(
  teamId: string,
  logger: Logger,
  slackChannelId: string,
  provider: Extract<ConnectorProvider, "slack_bot" | "slack"> = "slack"
): Promise<Result<boolean, Error>> {
  const slackConfigurations =
    await SlackConfigurationResource.listForTeamId(teamId);
  const connectorIds = slackConfigurations.map((c) => c.connectorId);
  const connectors = await ConnectorResource.fetchByIds(provider, connectorIds);
  const connector = connectors.find((c) => c.type === provider);

  if (!connector) {
    return new Err(
      new Error(
        `Connector not found for teamId ${teamId} and provider ${provider}`
      )
    );
  }

  const slackConfiguration = slackConfigurations.find(
    (c) => c.connectorId === connector.id
  );

  if (!slackConfiguration) {
    return new Err(
      new Error(`Slack configuration not found for teamId ${teamId}`)
    );
  }

  const { connectorId } = slackConfiguration;

  const slackClient = await getSlackClient(connectorId);

  reportSlackUsage({
    connectorId,
    method: "conversations.info",
    channelId: slackChannelId,
  });
  const remoteChannel = await slackClient.conversations.info({
    channel: slackChannelId,
  });
  const remoteChannelName = remoteChannel.channel?.name;

  if (!remoteChannel.ok || !remoteChannelName) {
    logger.error({
      connectorId,
      channelId: slackChannelId,
      error: remoteChannel.error,
    });
    return new Err(new Error("Could not get the Slack channel information."));
  }

  const { autoReadChannelPatterns } = slackConfiguration;

  const matchingPatterns = findMatchingChannelPatterns(
    remoteChannelName,
    autoReadChannelPatterns
  );
  if (matchingPatterns.length > 0) {
    if (!remoteChannel.channel?.is_member) {
      // Use the Temporal workflow to join the channel with built-in retries
      const joinChannelRes = await launchSlackJoinChannelsWorkflowAndWait(
        connectorId,
        [slackChannelId]
      );

      if (joinChannelRes.isErr()) {
        return joinChannelRes;
      }
    }

    let channel: SlackChannel | null = null;
    channel = await SlackChannel.findOne({
      where: {
        slackChannelId,
        connectorId,
      },
    });
    if (!channel) {
      channel = await SlackChannel.create({
        connectorId,
        slackChannelId,
        slackChannelName: remoteChannelName,
        permission: "read_write",
        private: remoteChannel.channel?.is_private ?? false,
      });
    } else {
      await channel.update({
        permission: "read_write",
      });
    }

    // For slack_bot context, only do the basic channel setup without data source operations
    if (provider === "slack_bot") {
      return new Ok(true);
    }

    // Slack context: perform full data source operations
    await upsertDataSourceFolder({
      dataSourceConfig: dataSourceConfigFromConnector(connector),
      folderId: slackChannelInternalIdFromSlackChannelId(slackChannelId),
      title: `#${remoteChannelName}`,
      parentId: null,
      parents: [slackChannelInternalIdFromSlackChannelId(slackChannelId)],
      mimeType: INTERNAL_MIME_TYPES.SLACK.CHANNEL,
      sourceUrl: getSlackChannelSourceUrl(slackChannelId, slackConfiguration),
      providerVisibility: remoteChannel.channel?.is_private
        ? "private"
        : "public",
    });

    const dustAPI = new DustAPI(
      { url: apiConfig.getDustFrontAPIUrl() },
      {
        workspaceId: connector.workspaceId,
        apiKey: connector.workspaceAPIKey,
      },
      logger
    );

    // Loop through all the matching patterns. Swallow errors and continue.
    const results = await concurrentExecutor(
      matchingPatterns,
      async (p: SlackAutoReadPattern) => {
        const searchParams = new URLSearchParams({
          vaultId: p.spaceId,
          dataSourceId: connector.dataSourceId,
        });

        const searchRes = await dustAPI.searchDataSourceViews(searchParams);
        if (searchRes.isErr()) {
          logger.error({
            connectorId,
            channelId: slackChannelId,
            error: searchRes.error.message,
          });

          throw new Error("Failed to join Slack channel in Dust.");
        }

        const [dataSourceView] = searchRes.value;

        if (!dataSourceView) {
          logger.error({
            connectorId,
            channelId: slackChannelId,
            error:
              "Failed to join Slack channel, there was an issue retrieving dataSourceViews",
          });

          return new Err(
            new Error("There was an issue retrieving dataSourceViews")
          );
        }

        // Retry if the patch operation fails - it can happen if the channel is not in ES yet
        try {
          await withRetries(
            logger,
            async (dataSourceView: DataSourceViewType) => {
              const updateDataSourceViewRes = await dustAPI.patchDataSourceView(
                dataSourceView,
                {
                  parentsToAdd: [
                    slackChannelInternalIdFromSlackChannelId(
                      channel.slackChannelId
                    ),
                  ],
                  parentsToRemove: undefined,
                }
              );

              if (updateDataSourceViewRes.isErr()) {
                throw new Error(
                  `Failed to update Slack data source view for space ${p.spaceId}.`
                );
              }
            },
            {
              retries: 3,
              delayBetweenRetriesMs: 5000,
            }
          )(dataSourceView);
        } catch (e) {
          return new Err(normalizeError(e));
        }

        return new Ok(true);
      },
      { concurrency: 5 }
    );

    // If any error, return the first error.
    if (results.some((r) => r.isErr())) {
      return results.find((r) => r.isErr())!;
    }

    return new Ok(true);
  }

  return new Ok(false);
}

/**
 * Process multiple channels for auto-read at once.
 * This is more efficient than calling autoReadChannel individually for each channel.
 */
export async function autoReadChannelsBulk(
  teamId: string,
  logger: Logger,
  slackChannelIds: string[],
  provider: Extract<ConnectorProvider, "slack_bot" | "slack"> = "slack"
): Promise<Result<boolean, Error>> {
  if (slackChannelIds.length === 0) {
    return new Ok(true);
  }

  const slackConfigurations =
    await SlackConfigurationResource.listForTeamId(teamId);
  const connectorIds = slackConfigurations.map((c) => c.connectorId);
  const connectors = await ConnectorResource.fetchByIds(provider, connectorIds);
  const connector = connectors.find((c) => c.type === provider);

  if (!connector) {
    return new Err(
      new Error(
        `Connector not found for teamId ${teamId} and provider ${provider}`
      )
    );
  }

  const slackConfiguration = slackConfigurations.find(
    (c) => c.connectorId === connector.id
  );

  if (!slackConfiguration) {
    return new Err(
      new Error(`Slack configuration not found for teamId ${teamId}`)
    );
  }

  const { connectorId } = slackConfiguration;
  const slackClient = await getSlackClient(connectorId);
  const { autoReadChannelPatterns } = slackConfiguration;

  // Collect channels that need to be joined
  const channelsToJoin: string[] = [];
  const channelsToProcess: Array<{
    channelId: string;
    channelName: string;
    isPrivate: boolean;
    matchingPatterns: SlackAutoReadPattern[];
  }> = [];

  // Check each channel to see if it matches patterns and needs joining
  for (const slackChannelId of slackChannelIds) {
    reportSlackUsage({
      connectorId,
      method: "conversations.info",
      channelId: slackChannelId,
    });

    const remoteChannel = await slackClient.conversations.info({
      channel: slackChannelId,
    });

    const remoteChannelName = remoteChannel.channel?.name;
    if (!remoteChannel.ok || !remoteChannelName) {
      logger.error({
        connectorId,
        channelId: slackChannelId,
        error: remoteChannel.error,
      });
      continue; // Skip this channel
    }

    const matchingPatterns = findMatchingChannelPatterns(
      remoteChannelName,
      autoReadChannelPatterns
    );

    if (matchingPatterns.length > 0) {
      if (!remoteChannel.channel?.is_member) {
        channelsToJoin.push(slackChannelId);
      }

      channelsToProcess.push({
        channelId: slackChannelId,
        channelName: remoteChannelName,
        isPrivate: remoteChannel.channel?.is_private ?? false,
        matchingPatterns,
      });
    }
  }

  // Join all channels at once using the workflow
  if (channelsToJoin.length > 0) {
    const joinChannelRes = await launchSlackJoinChannelsWorkflowAndWait(
      connectorId,
      channelsToJoin,
      true // allowUnlimitedChannels since we're handling bulk operations
    );

    if (joinChannelRes.isErr()) {
      return joinChannelRes;
    }
  }

  // Process all channels (update DB and data sources) using concurrentExecutor
  const channelResults = await concurrentExecutor(
    channelsToProcess,
    async (channelInfo) => {
      const { channelId, channelName, isPrivate, matchingPatterns } =
        channelInfo;

      try {
        let channel = await SlackChannel.findOne({
          where: {
            slackChannelId: channelId,
            connectorId,
          },
        });

        if (!channel) {
          channel = await SlackChannel.create({
            connectorId,
            slackChannelId: channelId,
            slackChannelName: channelName,
            permission: "read_write",
            private: isPrivate,
          });
        } else {
          await channel.update({
            permission: "read_write",
          });
        }

        // For slack_bot context, skip data source operations
        if (provider === "slack_bot") {
          return new Ok(true);
        }

        // Slack context: perform full data source operations
        await upsertDataSourceFolder({
          dataSourceConfig: dataSourceConfigFromConnector(connector),
          folderId: slackChannelInternalIdFromSlackChannelId(channelId),
          title: `#${channelName}`,
          parentId: null,
          parents: [slackChannelInternalIdFromSlackChannelId(channelId)],
          mimeType: INTERNAL_MIME_TYPES.SLACK.CHANNEL,
          sourceUrl: getSlackChannelSourceUrl(channelId, slackConfiguration),
          providerVisibility: isPrivate ? "private" : "public",
        });

        const dustAPI = new DustAPI(
          { url: apiConfig.getDustFrontAPIUrl() },
          {
            workspaceId: connector.workspaceId,
            apiKey: connector.workspaceAPIKey,
          },
          logger
        );

        // Process all matching patterns for this channel
        const results = await concurrentExecutor(
          matchingPatterns,
          async (p: SlackAutoReadPattern) => {
            const searchParams = new URLSearchParams({
              vaultId: p.spaceId,
              dataSourceId: connector.dataSourceId,
            });

            const searchRes = await dustAPI.searchDataSourceViews(searchParams);
            if (searchRes.isErr()) {
              logger.error({
                connectorId,
                channelId,
                error: searchRes.error.message,
              });
              throw new Error("Failed to join Slack channel in Dust.");
            }

            const [dataSourceView] = searchRes.value;
            if (!dataSourceView) {
              logger.error({
                connectorId,
                channelId,
                error:
                  "Failed to join Slack channel, there was an issue retrieving dataSourceViews",
              });
              return new Err(
                new Error("There was an issue retrieving dataSourceViews")
              );
            }

            // Retry if the patch operation fails
            try {
              await withRetries(
                logger,
                async (dataSourceView: DataSourceViewType) => {
                  const updateDataSourceViewRes =
                    await dustAPI.patchDataSourceView(dataSourceView, {
                      parentsToAdd: [
                        slackChannelInternalIdFromSlackChannelId(
                          channel.slackChannelId
                        ),
                      ],
                      parentsToRemove: undefined,
                    });

                  if (updateDataSourceViewRes.isErr()) {
                    throw new Error(
                      `Failed to update Slack data source view for space ${p.spaceId}.`
                    );
                  }
                },
                {
                  retries: 3,
                  delayBetweenRetriesMs: 5000,
                }
              )(dataSourceView);
            } catch (e) {
              return new Err(normalizeError(e));
            }

            return new Ok(true);
          },
          { concurrency: 5 }
        );

        // Check if any pattern failed
        if (results.some((r) => r.isErr())) {
          const firstError = results.find((r) => r.isErr())!;
          return firstError;
        }

        return new Ok(true);
      } catch (e) {
        logger.error({
          connectorId,
          channelId,
          error: normalizeError(e),
        });
        return new Err(normalizeError(e));
      }
    },
    { concurrency: 10 }
  );

  // Check results and log any failures
  const failedChannels = channelResults.filter((r) => r.isErr());
  if (failedChannels.length > 0) {
    logger.warn(
      {
        connectorId,
        failedCount: failedChannels.length,
        totalCount: channelsToProcess.length,
      },
      `Some channels failed during bulk auto-read processing`
    );

    // Return success if at least some channels succeeded
    if (failedChannels.length < channelsToProcess.length) {
      return new Ok(true);
    }

    // If all channels failed, return the first error
    return failedChannels[0];
  }

  return new Ok(true);
}
