import type { WorkspaceDomain } from "@dust-tt/types";
import { cacheWithRedis, DustAPI } from "@dust-tt/types";
import type { UsersInfoResponse, WebClient } from "@slack/web-api";
import type {
  Profile,
  User,
} from "@slack/web-api/dist/response/UsersInfoResponse";

import { getSlackConversationInfo } from "@connectors/connectors/slack/lib/slack_client";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import type { Connector } from "@connectors/lib/models";
import logger from "@connectors/logger/logger";

const WHITELISTED_BOT_NAME = ["Beaver", "feedback-hackaton"];

async function getActiveMemberEmails(connector: Connector): Promise<string[]> {
  const ds = dataSourceConfigFromConnector(connector);

  // List the emails of all active members in the workspace.
  const dustAPI = new DustAPI(
    {
      apiKey: ds.workspaceAPIKey,
      workspaceId: ds.workspaceId,
    },
    logger,
    { useLocalInDev: true }
  );

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
  (connector: Connector) => {
    return `active-member-emails-connector-${connector.id}`;
  },
  // Caches data for 15 minutes to limit frequent API calls.
  // Note: Updates (e.g., new members added by an admin) may take up to 15 minutes to be reflected.
  15 * 10 * 1000
);

async function getVerifiedDomainsForWorkspace(
  connector: Connector
): Promise<WorkspaceDomain[]> {
  const ds = dataSourceConfigFromConnector(connector);

  const dustAPI = new DustAPI(
    {
      apiKey: ds.workspaceAPIKey,
      workspaceId: ds.workspaceId,
    },
    logger,
    { useLocalInDev: true }
  );

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
  (connector: Connector) => {
    return `workspace-verified-domains-${connector.id}`;
  },
  // Caches data for 15 minutes to limit frequent API calls.
  // Note: Updates (e.g., workspace verified domains) may take up to 15 minutes to be reflected.
  15 * 10 * 1000
);

async function isAutoJoinEnabledForDomain(
  connector: Connector,
  slackUserInfo: UsersInfoResponse
): Promise<boolean> {
  const { user } = slackUserInfo;
  if (!user || !user.profile) {
    return false;
  }

  const userDomain = user.profile?.email?.split("@")[1];
  if (!userDomain) {
    return false;
  }

  const verifiedDomains = await getVerifiedDomainsForWorkspaceMemoized(
    connector
  );

  const isDomainAutoJoinEnabled = verifiedDomains.find(
    (vd) => vd.domain === userDomain
  );

  return isDomainAutoJoinEnabled?.domainAutoJoinEnabled ?? false;
}

const slackMembershipAccessBlocks = {
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
          url: "https://dust.tt/",
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

async function postMessageForUnhautorizedUser(
  connector: Connector,
  slackClient: WebClient,
  slackUserInfo: UsersInfoResponse,
  slackInfos: SlackInfos
) {
  const { slackChannelId, slackMessageTs } = slackInfos;

  const autoJoinEnabled = await isAutoJoinEnabledForDomain(
    connector,
    slackUserInfo
  );

  const slackMessageBlocks =
    slackMembershipAccessBlocks[
      autoJoinEnabled ? "autojoin_enabled" : "autojoin_disabled"
    ];

  return slackClient.chat.postMessage({
    channel: slackChannelId,
    blocks: slackMessageBlocks,
    thread_ts: slackMessageTs,
  });
}

export async function isActiveMemberOfWorkspace(
  connector: Connector,
  slackUserEmail: string | undefined
) {
  if (!slackUserEmail) {
    return false;
  }

  const workspaceActiveMemberEmails = await getActiveMemberEmailsMemoized(
    connector
  );

  return workspaceActiveMemberEmails.includes(slackUserEmail);
}

function isBotAllowed(user: User) {
  const { profile } = user;

  const displayName = profile?.display_name ?? "";
  const realName = profile?.real_name ?? "";

  const isWhitelistedBotName =
    WHITELISTED_BOT_NAME.includes(displayName) ||
    WHITELISTED_BOT_NAME.includes(realName);

  if (!isWhitelistedBotName) {
    logger.info({ user }, "Ignoring bot message");
  }

  return isWhitelistedBotName;
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
  slackClient: WebClient,
  profile: Profile,
  slackInfos: SlackInfos,
  whitelistedDomains?: readonly string[]
) {
  const { slackChannelId } = slackInfos;

  const userDomain = profile?.email?.split("@")[1];
  // Ensure the domain matches exactly.
  const isWhitelistedDomain = userDomain
    ? whitelistedDomains?.includes(userDomain) ?? false
    : false;

  const slackConversationInfo = await getSlackConversationInfo(
    slackClient,
    slackChannelId
  );

  const isChannelPublic = !slackConversationInfo.channel?.is_private;
  return isChannelPublic && isWhitelistedDomain;
}

async function isUserAllowed(
  connector: Connector,
  profile: Profile,
  whitelistedDomains?: readonly string[]
) {
  const isMember = await isActiveMemberOfWorkspace(connector, profile?.email);
  if (isMember) {
    return true;
  }

  // To de-risk while releasing, we relies on an array of whitelisted domains.
  // TODO(2024-02-08 flav) Remove once released is completed.
  if (whitelistedDomains && whitelistedDomains.length > 0) {
    const userDomain = profile?.email?.split("@")[1];

    if (userDomain) {
      return whitelistedDomains.includes(userDomain);
    }
  }

  return false;
}

async function isSlackUserAllowed(
  user: User,
  connector: Connector,
  slackClient: WebClient,
  slackInfos: SlackInfos,
  whitelistedDomains?: readonly string[]
) {
  const {
    is_restricted,
    is_stranger: isStranger,
    is_ultra_restricted,
    profile,
  } = user;

  const isInWorkspace = profile?.team === slackInfos.slackTeamId;
  if (!isInWorkspace) {
    return false;
  }

  const isGuest = is_restricted || is_ultra_restricted;
  const isExternal = isGuest || isStranger;
  const isExternalAllowed =
    isExternal &&
    (await isExternalUserAllowed(
      slackClient,
      profile,
      slackInfos,
      whitelistedDomains
    ));

  if (isExternalAllowed) {
    return true;
  }

  // Otherwise, ensure that the slack user is an active member in the workspace.
  return isUserAllowed(connector, profile, whitelistedDomains);
}

export async function notifyIfSlackUserIsNotAllowed(
  connector: Connector,
  slackClient: WebClient,
  slackUserInfo: UsersInfoResponse,
  slackInfos: SlackInfos,
  whitelistedDomains?: readonly string[]
): Promise<boolean> {
  const { user } = slackUserInfo;
  if (!user) {
    return false;
  }

  if (user.is_bot) {
    return isBotAllowed(user);
  }

  const isAllowed = await isSlackUserAllowed(
    user,
    connector,
    slackClient,
    slackInfos,
    whitelistedDomains
  );

  if (!isAllowed) {
    logger.info(
      {
        connectorId: connector.id,
        slackInfos,
        slackUserEmail: slackUserInfo.user?.profile?.email,
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

  return isAllowed;
}
