import type {
  AgentMessageSuccessEvent,
  ConversationType,
  LightAgentConfigurationType,
  ModelId,
  Result,
  UserMessageType,
} from "@dust-tt/types";
import type { PublicPostContentFragmentRequestBodySchema } from "@dust-tt/types";
import { Err, Ok, sectionFullText } from "@dust-tt/types";
import { DustAPI } from "@dust-tt/types";
import type { WebClient } from "@slack/web-api";
import type { MessageElement } from "@slack/web-api/dist/response/ConversationsHistoryResponse";
import type * as t from "io-ts";
import removeMarkdown from "remove-markdown";
import jaroWinkler from "talisman/metrics/jaro-winkler";

import { makeMessageUpdateBlocksAndText } from "@connectors/connectors/slack/chat/blocks";
import { streamConversationToSlack } from "@connectors/connectors/slack/chat/stream_conversation_handler";
import { SlackExternalUserError } from "@connectors/connectors/slack/lib/errors";
import type { SlackUserInfo } from "@connectors/connectors/slack/lib/slack_client";
import {
  getSlackBotInfo,
  getSlackClient,
  getSlackUserInfo,
} from "@connectors/connectors/slack/lib/slack_client";
import { getRepliesFromThread } from "@connectors/connectors/slack/lib/thread";
import {
  isBotAllowed,
  notifyIfSlackUserIsNotAllowed,
} from "@connectors/connectors/slack/lib/workspace_limits";
import { apiConfig } from "@connectors/lib/api/config";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  SlackChannel,
  SlackChatBotMessage,
} from "@connectors/lib/models/slack";
import { lockWithRedis } from "@connectors/lib/redis";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";

import {
  formatMessagesForUpsert,
  getBotUserIdMemoized,
  getUserName,
} from "./temporal/activities";

const { DUST_FRONT_API } = process.env;

export async function botAnswerMessageWithErrorHandling(
  message: string,
  slackTeamId: string,
  slackChannel: string,
  slackUserId: string | null,
  slackBotId: string | null,
  slackMessageTs: string,
  slackThreadTs: string | null
): Promise<Result<AgentMessageSuccessEvent | undefined, Error>> {
  const slackConfig =
    await SlackConfigurationResource.fetchByActiveBot(slackTeamId);
  if (!slackConfig) {
    return new Err(
      new Error(
        `Failed to find a Slack configuration for which the bot is enabled. Slack team id: ${slackTeamId}.`
      )
    );
  }
  const connector = await ConnectorResource.fetchById(slackConfig.connectorId);
  if (!connector) {
    return new Err(new Error("Failed to find connector"));
  }
  try {
    const res = await botAnswerMessage(
      message,
      slackTeamId,
      slackChannel,
      slackUserId,
      slackBotId,
      slackMessageTs,
      slackThreadTs,
      connector,
      slackConfig
    );

    if (res.isErr()) {
      logger.error(
        {
          error: res.error,
          errorMessage: res.error.message,
          slackTeamId: slackTeamId,
          slackChannel: slackChannel,
          slackUserId: slackUserId,
          slackMessageTs: slackMessageTs,
          slackBotId,
        },
        "Failed answering to Slack Chat Bot message"
      );
      let errorMessage: string | undefined = undefined;
      if (res.error instanceof SlackExternalUserError) {
        errorMessage = res.error.message;
      } else {
        errorMessage = `An error occured. Our team has been notified and will work on it as soon as possible.`;
      }

      const slackClient = await getSlackClient(connector.id);
      await slackClient.chat.postMessage({
        channel: slackChannel,
        text: errorMessage,
        thread_ts: slackMessageTs,
      });
    } else {
      logger.info(
        {
          connectorId: connector.id,
          message,
          slackTeamId: slackTeamId,
          slackChannel: slackChannel,
          slackUserId: slackUserId,
          slackMessageTs: slackMessageTs,
        },
        `Successfully answered to Slack Chat Bot message`
      );
    }

    return res;
  } catch (e) {
    logger.error(
      {
        error: e,
        connectorId: connector.id,
        slackTeamId,
      },
      `Unexpected exception answering to Slack Chat Bot message`
    );
    const slackClient = await getSlackClient(connector.id);
    await slackClient.chat.postMessage({
      channel: slackChannel,
      text: `An unexpected error occured. Our team has been notified.`,
      thread_ts: slackMessageTs,
    });

    return new Err(new Error(`An unexpected error occured`));
  }
}

async function botAnswerMessage(
  message: string,
  slackTeamId: string,
  slackChannel: string,
  slackUserId: string | null,
  slackBotId: string | null,
  slackMessageTs: string,
  slackThreadTs: string | null,
  connector: ConnectorResource,
  slackConfig: SlackConfigurationResource
): Promise<Result<AgentMessageSuccessEvent | undefined, Error>> {
  let lastSlackChatBotMessage: SlackChatBotMessage | null = null;
  if (slackThreadTs) {
    lastSlackChatBotMessage = await SlackChatBotMessage.findOne({
      where: {
        connectorId: connector.id,
        channelId: slackChannel,
        threadTs: slackThreadTs,
      },
      order: [["createdAt", "DESC"]],
      limit: 1,
    });
  }

  // We start by retrieving the slack user info.
  const slackClient = await getSlackClient(connector.id);

  let slackUserInfo: SlackUserInfo | null = null;
  // The order is important here because we want to prioritize the user id over the bot id.
  // When a bot sends a message "as a user", we want to honor the user and not the bot.
  if (slackUserId) {
    slackUserInfo = await getSlackUserInfo(slackClient, slackUserId);
  } else if (slackBotId) {
    slackUserInfo = await getSlackBotInfo(slackClient, slackBotId);
  }

  if (!slackUserInfo) {
    throw new Error("Failed to get slack user info");
  }

  if (slackUserInfo.is_bot) {
    const isBotAllowedRes = await isBotAllowed(connector, slackUserInfo);
    if (isBotAllowedRes.isErr()) {
      return isBotAllowedRes;
    }
  } else {
    const hasChatbotAccess = await notifyIfSlackUserIsNotAllowed(
      connector,
      slackClient,
      slackUserInfo,
      {
        slackChannelId: slackChannel,
        slackTeamId,
        slackMessageTs,
      },
      slackConfig.whitelistedDomains
    );
    if (!hasChatbotAccess) {
      return new Ok(undefined);
    }
  }

  const displayName = slackUserInfo.display_name ?? "";
  const realName = slackUserInfo.real_name ?? "";

  const slackUserIdOrBotId = slackUserId || slackBotId;
  if (!slackUserIdOrBotId) {
    throw new Error("Failed to get slack user id or bot id");
  }

  const slackChatBotMessage = await SlackChatBotMessage.create({
    connectorId: connector.id,
    message: message,
    slackUserId: slackUserIdOrBotId,
    slackEmail: slackUserInfo?.email || "unknown",
    slackUserName:
      // A slack bot has no display name but just a real name so we use it if we could not find the
      // display name.
      displayName || realName || "unknown",
    slackFullName: slackUserInfo.real_name || "unknown",
    slackTimezone: slackUserInfo.tz || null,
    slackAvatar: slackUserInfo.image_512 || null,
    channelId: slackChannel,
    messageTs: slackMessageTs,
    threadTs:
      slackThreadTs || lastSlackChatBotMessage?.threadTs || slackMessageTs,
    conversationId: lastSlackChatBotMessage?.conversationId,
    userType: slackUserInfo.is_bot ? "bot" : "user",
  });

  const buildContentFragmentRes = await makeContentFragment(
    slackClient,
    slackChannel,
    lastSlackChatBotMessage?.threadTs || slackThreadTs || slackMessageTs,
    lastSlackChatBotMessage?.messageTs || slackThreadTs || slackMessageTs,
    slackChatBotMessage,
    connector
  );

  if (!DUST_FRONT_API) {
    throw new Error("DUST_FRONT_API environment variable is not defined");
  }

  const dustAPI = new DustAPI(
    apiConfig.getDustAPIConfig(),
    {
      workspaceId: connector.workspaceId,
      apiKey: connector.workspaceAPIKey,
    },
    logger,
    {
      useLocalInDev: false,
      urlOverride: DUST_FRONT_API,
    }
  );

  const mainMessage = await slackClient.chat.postMessage({
    ...makeMessageUpdateBlocksAndText(null, {
      isThinking: true,
    }),
    channel: slackChannel,
    thread_ts: slackMessageTs,
  });

  // Slack sends the message with user ids when someone is mentionned (bot or user).
  // Here we remove the bot id from the message and we replace user ids by their display names.
  // Example: <@U01J9JZQZ8Z> What is the command to upgrade a workspace in production (cc
  // <@U91J1JEQZ1A>) ?
  // becomes: What is the command to upgrade a workspace in production (cc @julien) ?
  const matches = message.match(/<@[A-Z-0-9]+>/g);
  if (matches) {
    const mySlackUser = await getBotUserIdMemoized(connector.id);
    for (const m of matches) {
      const userId = m.replace(/<|@|>/g, "");
      if (userId === mySlackUser) {
        message = message.replace(m, "");
      } else {
        const userName = await getUserName(userId, connector.id, slackClient);
        message = message.replace(m, `@${userName}`);
      }
    }
  }

  // Remove markdown to extract mentions.
  const messageWithoutMarkdown = removeMarkdown(message);

  // Extract all ~mentions and +mentions
  const mentionCandidates =
    messageWithoutMarkdown.match(/(?<!\S)[+~]([a-zA-Z0-9_-]{1,40})(?!\S)/g) ||
    [];

  const mentions: { assistantName: string; assistantId: string }[] = [];
  if (mentionCandidates.length > 1) {
    return new Err(
      new SlackExternalUserError(
        "Only one assistant at a time can be called through Slack."
      )
    );
  }

  const agentConfigurationsRes = await dustAPI.getAgentConfigurations();
  if (agentConfigurationsRes.isErr()) {
    return new Err(new Error(agentConfigurationsRes.error.message));
  }
  const agentConfigurations = agentConfigurationsRes.value;

  if (mentionCandidates.length === 1) {
    for (const mc of mentionCandidates) {
      let bestCandidate:
        | {
            assistantId: string;
            assistantName: string;
            distance: number;
          }
        | undefined = undefined;
      for (const agentConfiguration of agentConfigurations) {
        const distance =
          1 -
          jaroWinkler(
            mc.slice(1).toLowerCase(),
            agentConfiguration.name.toLowerCase()
          );
        if (bestCandidate === undefined || bestCandidate.distance > distance) {
          bestCandidate = {
            assistantId: agentConfiguration.sId,
            assistantName: agentConfiguration.name,
            distance: distance,
          };
        }
      }

      if (bestCandidate) {
        mentions.push({
          assistantId: bestCandidate.assistantId,
          assistantName: bestCandidate.assistantName,
        });
        message = message.replace(
          mc,
          `:mention[${bestCandidate.assistantName}]{sId=${bestCandidate.assistantId}}`
        );
      }
    }
  } else {
    // If no mention is found, we look at channel-based routing rules.
    const channel = await SlackChannel.findOne({
      where: {
        connectorId: connector.id,
        slackChannelId: slackChannel,
      },
    });
    let agentConfigurationToMention: LightAgentConfigurationType | null = null;

    if (channel && channel.agentConfigurationId) {
      agentConfigurationToMention =
        agentConfigurations.find(
          (ac) => ac.sId === channel.agentConfigurationId
        ) || null;
    }

    if (agentConfigurationToMention) {
      mentions.push({
        assistantId: agentConfigurationToMention.sId,
        assistantName: agentConfigurationToMention.name,
      });
    } else {
      // If no mention is found and no channel-based routing rule is found, we use the default assistant.
      let defaultAssistant: LightAgentConfigurationType | null = null;
      defaultAssistant =
        agentConfigurations.find((ac) => ac.sId === "dust") || null;
      if (!defaultAssistant || defaultAssistant.status !== "active") {
        defaultAssistant =
          agentConfigurations.find((ac) => ac.sId === "gpt-4") || null;
      }
      if (!defaultAssistant) {
        return new Err(
          // not actually reachable, gpt-4 cannot be disabled.
          new SlackExternalUserError(
            "No assistant has been configured to reply on Slack."
          )
        );
      }
      mentions.push({
        assistantId: defaultAssistant.sId,
        assistantName: defaultAssistant.name,
      });
    }
  }

  if (message.trim() === "") {
    message = "?";
  }
  const messageReqBody = {
    content: message,
    mentions: mentions.map((m) => {
      return { configurationId: m.assistantId };
    }),
    context: {
      timezone: slackChatBotMessage.slackTimezone || "Europe/Paris",
      username: slackChatBotMessage.slackUserName,
      fullName:
        slackChatBotMessage.slackFullName || slackChatBotMessage.slackUserName,
      email: slackChatBotMessage.slackEmail,
      profilePictureUrl: slackChatBotMessage.slackAvatar || null,
      origin: "slack" as const,
    },
  };

  if (buildContentFragmentRes.isErr()) {
    return new Err(new Error(buildContentFragmentRes.error.message));
  }
  let conversation: ConversationType | undefined = undefined;
  let userMessage: UserMessageType | undefined = undefined;
  if (lastSlackChatBotMessage?.conversationId) {
    if (buildContentFragmentRes.value) {
      const contentFragmentRes = await dustAPI.postContentFragment({
        conversationId: lastSlackChatBotMessage.conversationId,
        contentFragment: buildContentFragmentRes.value,
      });
      if (contentFragmentRes.isErr()) {
        return new Err(new Error(contentFragmentRes.error.message));
      }
    }
    const mesasgeRes = await dustAPI.postUserMessage({
      conversationId: lastSlackChatBotMessage.conversationId,
      message: messageReqBody,
      userEmailHeader:
        slackChatBotMessage.slackEmail !== "unknown"
          ? slackChatBotMessage.slackEmail
          : undefined,
    });
    if (mesasgeRes.isErr()) {
      return new Err(new Error(mesasgeRes.error.message));
    }
    userMessage = mesasgeRes.value;
    const conversationRes = await dustAPI.getConversation({
      conversationId: lastSlackChatBotMessage.conversationId,
    });
    if (conversationRes.isErr()) {
      return new Err(new Error(conversationRes.error.message));
    }
    conversation = conversationRes.value;
  } else {
    const convRes = await dustAPI.createConversation({
      title: null,
      visibility: "unlisted",
      message: messageReqBody,
      contentFragment: buildContentFragmentRes.value || undefined,
      userEmailHeader:
        slackChatBotMessage.slackEmail !== "unknown"
          ? slackChatBotMessage.slackEmail
          : undefined,
    });
    if (convRes.isErr()) {
      return new Err(new Error(convRes.error.message));
    }

    conversation = convRes.value.conversation;
    userMessage = convRes.value.message;
  }
  slackChatBotMessage.conversationId = conversation.sId;
  await slackChatBotMessage.save();

  return streamConversationToSlack(dustAPI, {
    assistantName: mentions[0]?.assistantName,
    connector,
    conversation,
    mainMessage,
    slack: { slackChannelId: slackChannel, slackClient, slackMessageTs },
    userMessage,
  });
}

export async function getBotEnabled(
  connectorId: ModelId
): Promise<Result<boolean, Error>> {
  const slackConfig =
    await SlackConfigurationResource.fetchByConnectorId(connectorId);
  if (!slackConfig) {
    return new Err(
      new Error(
        `Failed to find a Slack configuration for connector ${connectorId}`
      )
    );
  }

  return new Ok(slackConfig.botEnabled);
}

async function makeContentFragment(
  slackClient: WebClient,
  channelId: string,
  threadTs: string,
  startingAtTs: string | null,
  slackChatBotMessage: SlackChatBotMessage,
  connector: ConnectorResource
): Promise<
  Result<
    t.TypeOf<typeof PublicPostContentFragmentRequestBodySchema> | null,
    Error
  >
> {
  let allMessages: MessageElement[] = [];

  const slackBotMessages = await SlackChatBotMessage.findAll({
    where: {
      connectorId: connector.id,
      channelId: channelId,
      threadTs: threadTs,
    },
  });
  const replies = await getRepliesFromThread({
    slackClient,
    channelId,
    threadTs,
  });
  let shouldTake = false;
  for (const reply of replies) {
    if (reply.ts === startingAtTs) {
      // Signal that we must take all the messages starting from this one.
      shouldTake = true;
    }
    if (!reply.user) {
      continue;
    }
    if (shouldTake) {
      if (slackBotMessages.find((sbm) => sbm.messageTs === reply.ts)) {
        // If this message is a mention to the bot, we don't send it as a content fragment.
        continue;
      }
      allMessages.push(reply);
    }
  }

  const botUserId = await getBotUserIdMemoized(connector.id);
  allMessages = allMessages.filter((m) => m.user !== botUserId);
  if (allMessages.length === 0) {
    return new Ok(null);
  }

  const channel = await slackClient.conversations.info({
    channel: channelId,
  });

  if (channel.error) {
    return new Err(
      new Error(`Could not retrieve channel name: ${channel.error}`)
    );
  }
  if (!channel.channel || !channel.channel.name) {
    return new Err(new Error("Could not retrieve channel name"));
  }

  const content = await formatMessagesForUpsert({
    dataSourceConfig: dataSourceConfigFromConnector(connector),
    channelName: channel.channel.name,
    messages: allMessages,
    isThread: true,
    connectorId: connector.id,
    slackClient,
  });

  let url: string | null = null;
  if (allMessages[0]?.ts) {
    const permalinkRes = await slackClient.chat.getPermalink({
      channel: channelId,
      message_ts: allMessages[0].ts,
    });
    if (!permalinkRes.ok || !permalinkRes.permalink) {
      return new Err(new Error(permalinkRes.error));
    }
    url = permalinkRes.permalink;
  }
  return new Ok({
    title: `Thread content from #${channel.channel.name}`,
    content: sectionFullText(content),
    url: url,
    contentType: "dust-application/slack",
    context: null,
  });
}
