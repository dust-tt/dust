import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

import type { RetrievePermissionsErrorCode } from "@connectors/connectors/interface";
import { ConnectorManagerError } from "@connectors/connectors/interface";
import { getChannels } from "@connectors/connectors/slack/lib/channels";
import { getSlackClient } from "@connectors/connectors/slack/lib/slack_client";
import { slackChannelInternalIdFromSlackChannelId } from "@connectors/connectors/slack/lib/utils";
import {
  ExternalOAuthTokenError,
  ProviderWorkflowError,
} from "@connectors/lib/error";
import { SlackChannel } from "@connectors/lib/models/slack";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import type { ConnectorPermission, ContentNode } from "@connectors/types";
import { INTERNAL_MIME_TYPES } from "@connectors/types";

export async function retrievePermissions({
  connectorId,
  parentInternalId,
  filterPermission,
}: {
  connectorId: number;
  parentInternalId: string | null;
  filterPermission: ConnectorPermission | null;
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

  const c = await ConnectorResource.fetchById(connectorId);
  if (!c) {
    logger.error({ connectorId }, "Connector not found");
    return new Err(
      new ConnectorManagerError("CONNECTOR_NOT_FOUND", "Connector not found")
    );
  }
  const slackConfig =
    await SlackConfigurationResource.fetchByConnectorId(connectorId);
  if (!slackConfig) {
    logger.error({ connectorId }, "Slack configuration not found");
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
      const slackClient = await getSlackClient(c.id, {
        // Do not reject rate limited calls in update connector. Called from the API.
        rejectRateLimitedCalls: false,
      });

      const [remoteChannels, localChannels] = await Promise.all([
        getChannels(slackClient, c.id, false),
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
      mimeType: INTERNAL_MIME_TYPES.SLACK.CHANNEL,
    }));

    resources.sort((a, b) => {
      return a.title.localeCompare(b.title);
    });

    return new Ok(resources);
  } catch (e) {
    if (e instanceof ExternalOAuthTokenError) {
      logger.error({ connectorId }, "Slack token invalid");
      return new Err(
        new ConnectorManagerError(
          "EXTERNAL_OAUTH_TOKEN_ERROR",
          "Slack authorization error, please re-authorize."
        )
      );
    }
    if (e instanceof ProviderWorkflowError && e.type === "rate_limit_error") {
      logger.error(
        { connectorId, error: e },
        "Slack rate limit when retrieving permissions."
      );
      return new Err(
        new ConnectorManagerError(
          "RATE_LIMIT_ERROR",
          `Slack rate limit error when retrieving content nodes.`
        )
      );
    }
    // Unhandled error, throwing to get a 500.
    throw e;
  }
}
