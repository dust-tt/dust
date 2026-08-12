import {
  getSlackClient,
  SLACK_API_PAGE_SIZE,
} from "@app/lib/api/actions/servers/slack/helpers";
import config from "@app/lib/api/config";
import { getOAuthConnectionAccessToken } from "@app/lib/api/oauth_access_token";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import logger from "@app/logger/logger";
import type {
  GetSlackUserPrivateChannelsResponseBody,
  SlackUserPrivateChannel,
} from "@app/types/api/assistant/builder/slack/user_private_channels";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";

async function isSlackToolsAvailable(auth: Authenticator): Promise<boolean> {
  const servers = await InternalMCPServerInMemoryResource.listByWorkspace(auth);
  return servers.some((server) => server.toJSON().name === "slack");
}

async function listPrivateChannelsWithToken(
  accessToken: string,
  teamId: string | null
): Promise<Result<SlackUserPrivateChannel[], Error>> {
  try {
    const slackClient = await getSlackClient(accessToken);
    const channels: SlackUserPrivateChannel[] = [];
    let cursor: string | undefined;

    do {
      const response = await slackClient.users.conversations({
        cursor,
        limit: SLACK_API_PAGE_SIZE,
        exclude_archived: true,
        types: "private_channel",
      });

      if (!response.ok) {
        return new Err(
          new Error(
            `Failed to list private Slack channels: ${response.error ?? "unknown"}`
          )
        );
      }

      for (const channel of response.channels ?? []) {
        if (!channel.id || !channel.name) {
          continue;
        }
        channels.push({
          slackChannelId: channel.id,
          slackChannelName: `#${channel.name}`,
          sourceUrl: teamId
            ? `https://app.slack.com/client/${teamId}/${channel.id}`
            : null,
        });
      }

      cursor = response.response_metadata?.next_cursor || undefined;
    } while (cursor);

    return new Ok(channels);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

async function listPrivateChannelIdsWithToken(
  accessToken: string
): Promise<Result<Set<string>, Error>> {
  const channelsRes = await listPrivateChannelsWithToken(accessToken, null);
  if (channelsRes.isErr()) {
    return channelsRes;
  }
  return new Ok(
    new Set(channelsRes.value.map((channel) => channel.slackChannelId))
  );
}

// Resolves the workspace Slack / Slack Bot connector and returns the set of
// private channel IDs the Dust bot has joined.
async function listDustBotPrivateChannelIds(
  auth: Authenticator
): Promise<Result<Set<string>, Error>> {
  const [[dataSourceSlack], [dataSourceSlackBot]] = await Promise.all([
    DataSourceResource.listByConnectorProvider(auth, "slack"),
    DataSourceResource.listByConnectorProvider(auth, "slack_bot"),
  ]);

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  let isSlackBotEnabled = false;
  if (dataSourceSlackBot?.connectorId) {
    const configRes = await connectorsAPI.getConnectorConfig(
      dataSourceSlackBot.connectorId,
      "botEnabled"
    );
    if (configRes.isOk()) {
      isSlackBotEnabled = configRes.value.configValue === "true";
    }
  }

  const dataSource = isSlackBotEnabled ? dataSourceSlackBot : dataSourceSlack;
  if (!dataSource?.connectorId) {
    return new Ok(new Set());
  }

  const connRes = await connectorsAPI.getConnector(dataSource.connectorId);
  if (connRes.isErr() || !connRes.value.connectionId) {
    return new Err(
      new Error(
        `Failed to get Slack connector: ${
          connRes.isErr() ? connRes.error.message : "missing connectionId"
        }`
      )
    );
  }

  const tokenRes = await getOAuthConnectionAccessToken({
    config: config.getOAuthAPIConfig(),
    logger,
    connectionId: connRes.value.connectionId,
  });
  if (tokenRes.isErr()) {
    return new Err(
      new Error(
        `Failed to get Slack bot access token: ${tokenRes.error.message}`
      )
    );
  }

  return listPrivateChannelIdsWithToken(tokenRes.value.access_token);
}

/**
 * Lists private Slack channels the current user is a member of *and* where the
 * Dust bot is present. User membership is discovered via the personal Slack
 * Tools OAuth token (ToS-safe; scoped to the requesting admin). Dust presence
 * is the intersection with the bot's joined private channels — matching the
 * public-channel picker, which only surfaces channels the bot can write to.
 */
export async function listUserPrivateSlackChannels(
  auth: Authenticator
): Promise<Result<GetSlackUserPrivateChannelsResponseBody, Error>> {
  if (!(await isSlackToolsAvailable(auth))) {
    return new Ok({
      status: "tool_unavailable",
      channels: [],
    });
  }

  const personalConnection =
    await MCPServerConnectionResource.findByInternalServerName(auth, {
      serverName: "slack",
      connectionType: "personal",
    });

  if (!personalConnection?.connectionId) {
    return new Ok({
      status: "not_connected",
      channels: [],
    });
  }

  const tokenRes = await getOAuthConnectionAccessToken({
    config: config.getOAuthAPIConfig(),
    logger,
    connectionId: personalConnection.connectionId,
  });

  if (tokenRes.isErr()) {
    return new Err(
      new Error(
        `Failed to get Slack personal access token: ${tokenRes.error.message}`
      )
    );
  }

  const teamId = isString(tokenRes.value.connection.metadata.team_id)
    ? tokenRes.value.connection.metadata.team_id
    : null;

  const [userChannelsRes, botChannelIdsRes] = await Promise.all([
    listPrivateChannelsWithToken(tokenRes.value.access_token, teamId),
    listDustBotPrivateChannelIds(auth),
  ]);

  if (userChannelsRes.isErr()) {
    return userChannelsRes;
  }
  if (botChannelIdsRes.isErr()) {
    return botChannelIdsRes;
  }

  const channels = userChannelsRes.value
    .filter((channel) => botChannelIdsRes.value.has(channel.slackChannelId))
    .sort((a, b) => a.slackChannelName.localeCompare(b.slackChannelName));

  return new Ok({
    status: "ok",
    channels,
  });
}
