import type { Result, WorkspaceDomainType } from "@dust-tt/client";
import { DustAPI, Err, Ok } from "@dust-tt/client";
import type { WebClient } from "@slack/web-api";
import type {} from "@slack/web-api/dist/types/response/UsersInfoResponse";

import { SlackExternalUserError } from "@connectors/connectors/slack/lib/errors";
import type { SlackUserInfo } from "@connectors/connectors/slack/lib/slack_client";
import {
  getSlackConversationInfo,
  reportSlackUsage,
} from "@connectors/connectors/slack/lib/slack_client";
import { apiConfig } from "@connectors/lib/api/config";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import type { DataSourceConfig } from "@connectors/types";
import { cacheWithRedis } from "@connectors/types";

function getDustAPI(dataSourceConfig: DataSourceConfig) {
  return new DustAPI(
    {
      url: apiConfig.getDustFrontAPIUrl(),
    },
    {
      apiKey: dataSourceConfig.workspaceAPIKey,
      workspaceId: dataSourceConfig.workspaceId,
    },
    logger
  );
}

async function getActiveMemberEmails(
  connector: ConnectorResource
): Promise<string[]> {
  const ds = dataSourceConfigFromConnector(connector);

  // List the emails of all active members in the workspace.
  const dustAPI = getDustAPI(ds);

  const activeMemberEmailsRes =
    await dustAPI.getActiveMemberEmailsInWorkspace();
  if (activeMemberEmailsRes.isErr()) {
    logger.error("Error getting all members in workspace.", {
      error: activeMemberEmailsRes.error,
    });

    throw new Error("Error getting all members in workspace.");
  }

  return activeMemberEmailsRes.value;
}

export const getActiveMemberEmailsMemoized = cacheWithRedis(
  getActiveMemberEmails,
  (connector: ConnectorResource) => {
    return `active-member-emails-connector-${connector.id}`;
  },
  // Caches data for 2 minutes to limit frequent API calls.
  // Note: Updates (e.g., new members added by an admin) may take up to 2 minutes to be reflected.
  {
    ttlMs: 2 * 10 * 1000,
  }
);

async function getVerifiedDomainsForWorkspace(
  connector: ConnectorResource
): Promise<WorkspaceDomainType[]> {
  const ds = dataSourceConfigFromConnector(connector);

  const dustAPI = getDustAPI(ds);

  const workspaceVerifiedDomainsRes =
    await dustAPI.getWorkspaceVerifiedDomains();
  if (workspaceVerifiedDomainsRes.isErr()) {
    logger.error("Error getting verified domains for workspace.", {
      error: workspaceVerifiedDomainsRes.error,
    });

    throw new Error("Error getting verified domains for workspace.");
  }

  return workspaceVerifiedDomainsRes.value;
}

export const getVerifiedDomainsForWorkspaceMemoized = cacheWithRedis(
  getVerifiedDomainsForWorkspace,
  (connector: ConnectorResource) => {
    return `workspace-verified-domains-${connector.id}`;
  },
  // Caches data for 15 minutes to limit frequent API calls.
  // Note: Updates (e.g., workspace verified domains) may take up to 15 minutes to be reflected.
  {
    ttlMs: 15 * 10 * 1000,
  }
);

function getSlackUserEmailFromProfile(
  slackUserInfo: SlackUserInfo | undefined
): string | undefined {
  return slackUserInfo?.email?.toLowerCase();
}

function getSlackUserEmailDomainFromProfile(
  slackUserInfo: SlackUserInfo | undefined
): string | undefined {
  return getSlackUserEmailFromProfile(slackUserInfo)?.split("@")[1];
}

async function isAutoJoinEnabledForDomain(
  connector: ConnectorResource,
  slackUserInfo: SlackUserInfo
): Promise<boolean> {
  const userDomain = getSlackUserEmailDomainFromProfile(slackUserInfo);
  if (!userDomain) {
    return false;
  }

  const verifiedDomains =
    await getVerifiedDomainsForWorkspaceMemoized(connector);

  const isDomainAutoJoinEnabled = verifiedDomains.find(
    (vd) => vd.domain === userDomain
  );

  return isDomainAutoJoinEnabled?.domainAutoJoinEnabled ?? false;
}

function makeSlackMembershipAccessBlocksForConnector(
  connector: ConnectorResource
) {
  return {
    autojoin_enabled: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "The Slack integration is accessible to members of your company's Dust workspace. Click 'Join My Workspace' to get started. For help, contact an administrator.",
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Join My Workspace",
              emoji: true,
            },
            style: "primary",
            value: "join_my_workspace_cta",
            action_id: "actionId-0",
            // TODO(2024-02-01 flav) don't hardcode URL.
            url: `https://dust.tt/w/${connector.workspaceId}/join?wId=${connector.workspaceId}`,
          },
        ],
      },
    ],
    autojoin_disabled: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "It looks like you're not a member of your company's Dust workspace yet. Please reach out to an administrator to join and start using Dust on Slack.",
        },
      },
    ],
  };
}

async function postMessageForUnhautorizedUser(
  connector: ConnectorResource,
  slackClient: WebClient,
  slackUserInfo: SlackUserInfo,
  slackInfos: SlackInfos
) {
  const { slackChannelId, slackMessageTs } = slackInfos;

  const autoJoinEnabled = await isAutoJoinEnabledForDomain(
    connector,
    slackUserInfo
  );

  const slackMessageBlocks =
    makeSlackMembershipAccessBlocksForConnector(connector)[
      autoJoinEnabled ? "autojoin_enabled" : "autojoin_disabled"
    ];

  reportSlackUsage({
    connectorId: connector.id,
    method: "chat.postMessage",
    channelId: slackChannelId,
  });
  return slackClient.chat.postMessage({
    channel: slackChannelId,
    blocks: slackMessageBlocks,
    thread_ts: slackMessageTs,
  });
}

export async function isActiveMemberOfWorkspace(
  connector: ConnectorResource,
  slackUserEmail: string | undefined
) {
  if (!slackUserEmail) {
    return false;
  }

  const workspaceActiveMemberEmails =
    await getActiveMemberEmailsMemoized(connector);

  return workspaceActiveMemberEmails.includes(slackUserEmail);
}

export async function isBotAllowed(
  connector: ConnectorResource,
  slackUserInfo: SlackUserInfo
): Promise<Result<undefined, Error>> {
  const realName = slackUserInfo.real_name;

  if (!realName) {
    throw new Error("Failed to get bot name. Should never happen.");
  }

  // Whitelisting a bot will accept any message from this bot.
  // This means that even a non verified user of a given Slack workspace who can trigger a bot
  // that talks to our bot (@dust) will be able to use the Dust bot.
  // Make sure to be explicit about this with users as you whitelist a new bot.
  // Example: non-verified-user -> @AnyWhitelistedBot -> @dust -> Dust answers with potentially private information.
  const slackConfig = await SlackConfigurationResource.fetchByConnectorId(
    connector.id
  );
  const whitelist = await slackConfig?.isBotWhitelistedToSummon(realName);

  if (!whitelist) {
    logger.info(
      { user: slackUserInfo, connectorId: connector.id },
      "Ignoring bot message"
    );

    return new Err(
      new SlackExternalUserError(
        "To enable Slack Workflows to call Dust agents, email us at support@dust.tt."
      )
    );
  }

  return new Ok(undefined);
}

interface SlackInfos {
  slackChannelId: string;
  slackMessageTs: string;
  slackTeamId: string;
}

// Verify the Slack user is not an external guest to the workspace.
// An exception is made for users from domains on the whitelist,
// allowing them to interact with the bot in public channels.
// See incident: https://dust4ai.slack.com/archives/C05B529FHV1/p1704799263814619.
async function isExternalUserAllowed(
  connector: ConnectorResource,
  slackClient: WebClient,
  slackUserInfo: SlackUserInfo,
  slackInfos: SlackInfos,
  // Whitelisted domains are in the format "domain:group_id".
  whitelistedDomains?: readonly string[]
): Promise<{ authorized: boolean; groupIds: string[] }> {
  const { slackChannelId } = slackInfos;

  const userDomain = getSlackUserEmailDomainFromProfile(slackUserInfo);

  if (!userDomain || !whitelistedDomains) {
    return { authorized: false, groupIds: [] };
  }

  const authorization = whitelistedDomains.reduce(
    (acc, domain) => {
      const [whitelistedDomain, whitelistedGroup] = domain.split(":");
      if (userDomain === whitelistedDomain && whitelistedGroup) {
        acc.authorized = true;
        acc.groupIds.push(whitelistedGroup);
      }
      return acc;
    },
    {
      authorized: false,
      groupIds: [],
    } as { authorized: boolean; groupIds: string[] }
  );

  const slackConversationInfo = await getSlackConversationInfo(
    connector.id,
    slackClient,
    slackChannelId
  );

  const isChannelPublic = !slackConversationInfo.channel?.is_private;
  if (!isChannelPublic) {
    return { authorized: false, groupIds: [] };
  }
  return authorization;
}

async function isUserAllowed(
  connector: ConnectorResource,
  slackUserInfo: SlackUserInfo
) {
  const isMember = await isActiveMemberOfWorkspace(
    connector,
    getSlackUserEmailFromProfile(slackUserInfo)
  );
  if (isMember) {
    return true;
  }
  return false;
}

async function isSlackUserAllowed(
  slackUserInfo: SlackUserInfo,
  connector: ConnectorResource,
  slackClient: WebClient,
  slackInfos: SlackInfos
) {
  const { teamId } = slackUserInfo;

  const isInWorkspace = teamId === slackInfos.slackTeamId;
  if (!isInWorkspace) {
    return false;
  }

  // Otherwise, ensure that the slack user is an active member in the workspace.
  return isUserAllowed(connector, slackUserInfo);
}

export async function notifyIfSlackUserIsNotAllowed(
  connector: ConnectorResource,
  slackClient: WebClient,
  slackUserInfo: SlackUserInfo,
  slackInfos: SlackInfos,
  whitelistedDomains?: readonly string[]
): Promise<{
  authorized: boolean;
  groupIds: string[];
}> {
  if (!slackUserInfo) {
    return { authorized: false, groupIds: [] };
  }

  // Handle Slack users that we consider external to the Slack workspace,
  // which can be eventually whitelisted via the `whitelistedDomains` list.
  const {
    is_restricted,
    is_stranger: isStranger,
    is_ultra_restricted,
  } = slackUserInfo;
  const isGuest = is_restricted || is_ultra_restricted;
  const isExternal = isGuest || isStranger;
  if (isExternal) {
    // If the external user is allowed, they are allowed with a specific group id.
    return isExternalUserAllowed(
      connector,
      slackClient,
      slackUserInfo,
      slackInfos,
      whitelistedDomains
    );
  }

  // Handle users that are not Slack external.
  const isAllowed = await isSlackUserAllowed(
    slackUserInfo,
    connector,
    slackClient,
    slackInfos
  );

  if (!isAllowed) {
    logger.info(
      {
        connectorId: connector.id,
        slackInfos,
        slackUserEmail: getSlackUserEmailFromProfile(slackUserInfo),
      },
      "Unauthorized Slack user attempted to access webhook."
    );

    await postMessageForUnhautorizedUser(
      connector,
      slackClient,
      slackUserInfo,
      slackInfos
    );
  }

  // If the user is part of the Dust workspace, they are allowed without any explicit group id.
  return { authorized: isAllowed, groupIds: [] };
}
