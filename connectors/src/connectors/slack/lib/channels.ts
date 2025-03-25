import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";

import { isSlackWebAPIPlatformError } from "@connectors/connectors/slack/lib/errors";
import {
  getSlackChannelSourceUrl,
  slackChannelInternalIdFromSlackChannelId,
} from "@connectors/connectors/slack/lib/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import { SlackChannel } from "@connectors/lib/models/slack";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import type { ConnectorPermission } from "@connectors/types";
import type { ModelId } from "@connectors/types";
import { INTERNAL_MIME_TYPES } from "@connectors/types";

import { getSlackClient } from "./slack_client";

export type SlackChannelType = {
  id: number;
  connectorId: number;

  name: string;
  slackId: string;
  permission: ConnectorPermission;
  agentConfigurationId: string | null;
  private: boolean;
};

export async function updateSlackChannelInConnectorsDb({
  slackChannelId,
  slackChannelName,
  connectorId,
}: {
  slackChannelId: string;
  slackChannelName: string;
  connectorId: number;
}): Promise<SlackChannelType> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Could not find connector ${connectorId}`);
  }

  let channel = await SlackChannel.findOne({
    where: {
      connectorId,
      slackChannelId,
    },
  });

  if (!channel) {
    throw new Error(
      `Could not find channel: connectorId=${connectorId} slackChannelId=${slackChannelId}`
    );
  } else {
    if (channel.slackChannelName !== slackChannelName) {
      channel = await channel.update({
        slackChannelName,
      });
    }
  }

  return {
    id: channel.id,
    connectorId: channel.connectorId,
    name: channel.slackChannelName,
    slackId: channel.slackChannelId,
    permission: channel.permission,
    agentConfigurationId: channel.agentConfigurationId,
    private: channel.private,
  };
}

export async function updateSlackChannelInCoreDb(
  connectorId: ModelId,
  channelId: string,
  timestampMs: number | undefined
) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const slackConfiguration =
    await SlackConfigurationResource.fetchByConnectorId(connectorId);
  if (!slackConfiguration) {
    throw new Error(
      `Could not find slack configuration for connector ${connector}`
    );
  }

  const channelOnDb = await SlackChannel.findOne({
    where: {
      connectorId: connector.id,
      slackChannelId: channelId,
    },
  });
  if (!channelOnDb) {
    logger.warn(
      {
        connectorId,
        channelId,
      },
      "Could not find channel in connectors db, skipping for now."
    );
    return;
  }

  const folderId = slackChannelInternalIdFromSlackChannelId(channelId);

  await upsertDataSourceFolder({
    dataSourceConfig: dataSourceConfigFromConnector(connector),
    folderId,
    title: `#${channelOnDb.slackChannelName}`,
    parentId: null,
    parents: [folderId],
    mimeType: INTERNAL_MIME_TYPES.SLACK.CHANNEL,
    sourceUrl: getSlackChannelSourceUrl(channelId, slackConfiguration),
    providerVisibility: channelOnDb.private ? "private" : "public",
    timestampMs,
  });
}

export async function joinChannel(
  connectorId: ModelId,
  channelId: string
): Promise<
  Result<
    { result: "ok" | "already_joined" | "is_archived"; channel: Channel },
    Error
  >
> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const client = await getSlackClient(connector.id);
  try {
    const channelInfo = await client.conversations.info({ channel: channelId });
    if (!channelInfo.channel) {
      return new Err(new Error("Channel not found."));
    }
    if (channelInfo.channel?.is_member) {
      return new Ok({ result: "already_joined", channel: channelInfo.channel });
    }
    if (channelInfo.channel?.is_archived) {
      return new Ok({ result: "is_archived", channel: channelInfo.channel });
    }
    const joinRes = await client.conversations.join({ channel: channelId });
    if (joinRes.ok) {
      return new Ok({ result: "ok", channel: channelInfo.channel });
    } else {
      return new Ok({ result: "already_joined", channel: channelInfo.channel });
    }
  } catch (e) {
    if (isSlackWebAPIPlatformError(e)) {
      if (e.data.error === "missing_scope") {
        logger.error(
          {
            channelId,
            connectorId,
            error: e,
          },
          "Could not join the channel because of a missing scope. Please re-authorize your Slack connection and try again."
        );
        return new Err(
          new Error(
            "Could not join the channel because of a missing scope. Please re-authorize your Slack connection and try again."
          )
        );
      }
      logger.error(
        {
          connectorId,
          channelId,
          error: e,
        },
        "Can't join the channel"
      );

      return new Err(e);
    }

    logger.error(
      {
        connectorId,
        channelId,
        error: e,
      },
      "Can't join the channel. Unknown error."
    );

    return new Err(new Error(`Can't join the channel`));
  }
}
