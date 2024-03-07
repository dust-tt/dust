import type {
  AgentActionType,
  AgentMessageType,
  ConversationType,
  LightAgentConfigurationType,
  ModelId,
  RetrievalDocumentType,
  UserMessageType,
} from "@dust-tt/types";
import type {
  AgentGenerationSuccessEvent,
  PublicPostContentFragmentRequestBodySchema,
} from "@dust-tt/types";
import { sectionFullText } from "@dust-tt/types";
import { DustAPI } from "@dust-tt/types";
import type { WebClient } from "@slack/web-api";
import type { MessageElement } from "@slack/web-api/dist/response/ConversationsHistoryResponse";
import type * as t from "io-ts";
import removeMarkdown from "remove-markdown";
import slackifyMarkdown from "slackify-markdown";
import jaroWinkler from "talisman/metrics/jaro-winkler";

import {
  getSlackClient,
  getSlackUserInfo,
} from "@connectors/connectors/slack/lib/slack_client";
import { getRepliesFromThread } from "@connectors/connectors/slack/lib/thread";
import { notifyIfSlackUserIsNotAllowed } from "@connectors/connectors/slack/lib/workspace_limits";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  SlackChannel,
  SlackChatBotMessage,
  SlackConfiguration,
} from "@connectors/lib/models/slack";
import type { Result } from "@connectors/lib/result";
import { Err, Ok } from "@connectors/lib/result";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

import {
  formatMessagesForUpsert,
  getBotUserIdMemoized,
  getUserName,
} from "./temporal/activities";

const { DUST_CLIENT_FACING_URL, DUST_FRONT_API } = process.env;

class SlackExternalUserError extends Error {}

/* After this length we start risking that the chat.update Slack API returns
 * "msg_too_long" error. This length is experimentally tested and was not found
 * in the slack documentation. Therefore, it is conservative and the actual
 * threshold might is more likely around 3800 characters. Since avoiding too
 * long messages in slack is a good thing nonetheless, we keep this lower threshold.
 */
const MAX_SLACK_MESSAGE_LENGTH = 3000;

export async function botAnswerMessageWithErrorHandling(
  message: string,
  slackTeamId: string,
  slackChannel: string,
  slackUserId: string,
  slackMessageTs: string,
  slackThreadTs: string | null
): Promise<Result<AgentGenerationSuccessEvent | undefined, Error>> {
  const slackConfig = await SlackConfiguration.findOne({
    where: {
      slackTeamId: slackTeamId,
      botEnabled: true,
    },
  });
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
      slackMessageTs,
      slackThreadTs,
      connector,
      slackConfig
    );
    if (res.isErr()) {
      logger.error(
        {
          error: res.error,
          slackTeamId: slackTeamId,
          slackChannel: slackChannel,
          slackUserId: slackUserId,
          slackMessageTs: slackMessageTs,
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
  slackUserId: string,
  slackMessageTs: string,
  slackThreadTs: string | null,
  connector: ConnectorResource,
  slackConfig: SlackConfiguration
): Promise<Result<AgentGenerationSuccessEvent | undefined, Error>> {
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
  const slackUserInfo = await getSlackUserInfo(slackClient, slackUserId);

  if (!slackUserInfo.ok || !slackUserInfo.user) {
    throw new Error(`Failed to get user info: ${slackUserInfo.error}`);
  }

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

  const slackUser = slackUserInfo.user;
  const displayName = slackUser.profile?.display_name ?? "";
  const realName = slackUser.profile?.real_name ?? "";

  const slackChatBotMessage = await SlackChatBotMessage.create({
    connectorId: connector.id,
    message: message,
    slackUserId: slackUserId,
    slackEmail: slackUser.profile?.email || "unknown",
    slackUserName:
      // A slack bot has no display name but just a real name so we use it if we could not find the
      // display name.
      displayName || realName || "unknown",
    slackFullName: slackUser.profile?.real_name || "unknown",
    slackTimezone: slackUser.tz || null,
    slackAvatar: slackUser.profile?.image_512 || null,
    channelId: slackChannel,
    messageTs: slackMessageTs,
    threadTs:
      slackThreadTs || lastSlackChatBotMessage?.threadTs || slackMessageTs,
    conversationId: lastSlackChatBotMessage?.conversationId,
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
    channel: slackChannel,
    text: "_Thinking..._",
    thread_ts: slackMessageTs,
    mrkdwn: true,
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
    });
    if (convRes.isErr()) {
      return new Err(new Error(convRes.error.message));
    }

    conversation = convRes.value.conversation;
    userMessage = convRes.value.message;
  }
  slackChatBotMessage.conversationId = conversation.sId;
  await slackChatBotMessage.save();

  const agentMessages = conversation.content
    .map((versions) => {
      const m = versions[versions.length - 1];
      return m;
    })
    .filter((m) => {
      return (
        m &&
        m.type === "agent_message" &&
        m.parentMessageId === userMessage?.sId
      );
    });
  if (agentMessages.length === 0) {
    return new Err(new Error("Failed to retrieve agent message"));
  }
  const agentMessage = agentMessages[0] as AgentMessageType;

  const streamRes = await dustAPI.streamAgentMessageEvents({
    conversation: conversation,
    message: agentMessage,
  });

  if (streamRes.isErr()) {
    return new Err(new Error(streamRes.error.message));
  }

  const botIdentity = `@${mentions[0]?.assistantName}:\n`;
  let fullAnswer = botIdentity;
  let action: AgentActionType | null = null;
  let lastSentDate = new Date();
  for await (const event of streamRes.value.eventStream) {
    switch (event.type) {
      case "user_message_error": {
        return new Err(
          new Error(
            `User message error: code: ${event.error.code} message: ${event.error.message}`
          )
        );
      }

      case "agent_error": {
        return new Err(
          new Error(
            `Agent message error: code: ${event.error.code} message: ${event.error.message}`
          )
        );
      }
      case "generation_tokens": {
        fullAnswer += event.text;
        if (lastSentDate.getTime() + 1500 > new Date().getTime()) {
          continue;
        }
        lastSentDate = new Date();

        let finalAnswer = slackifyMarkdown(
          normalizeContentForSlack(_processCiteMention(fullAnswer, action))
        );

        // if the message is too long, we avoid the update entirely (to reduce
        // rate limiting) the previous update will have shown the "..." and the
        // link to continue the conversation so this is fine
        if (finalAnswer.length > MAX_SLACK_MESSAGE_LENGTH) break;

        finalAnswer += `...\n\n <${DUST_CLIENT_FACING_URL}/w/${connector.workspaceId}/assistant/${conversation.sId}|Continue this conversation on Dust>`;

        await slackClient.chat.update({
          channel: slackChannel,
          text: finalAnswer,
          ts: mainMessage.ts as string,
          thread_ts: slackMessageTs,
        });
        break;
      }
      case "agent_action_success": {
        action = event.action;
        break;
      }
      case "agent_generation_success": {
        fullAnswer = `${botIdentity}${event.text}`;

        let finalAnswer = slackifyMarkdown(
          normalizeContentForSlack(_processCiteMention(fullAnswer, action))
        );

        // if the message is too long, when generation is finished we show it
        // is truncated
        if (finalAnswer.length > MAX_SLACK_MESSAGE_LENGTH)
          finalAnswer =
            finalAnswer.slice(0, MAX_SLACK_MESSAGE_LENGTH) +
            "... (message truncated)";

        finalAnswer += `\n\n <${DUST_CLIENT_FACING_URL}/w/${connector.workspaceId}/assistant/${conversation.sId}|Continue this conversation on Dust>`;

        await slackClient.chat.update({
          channel: slackChannel,
          text: finalAnswer,
          ts: mainMessage.ts as string,
          thread_ts: slackMessageTs,
        });
        return new Ok(event);
      }
      default:
      // Nothing to do on unsupported events
    }
  }
  return new Err(new Error("Failed to get the final answer from Dust"));
}

function normalizeContentForSlack(content: string): string {
  // Remove language hint from code blocks.
  return content.replace(/```[a-z\-_]*\n/g, "```\n");
}

function _processCiteMention(
  content: string,
  action: AgentActionType | null
): string {
  const references: { [key: string]: RetrievalDocumentType } = {};

  if (action && action.type === "retrieval_action" && action.documents) {
    action.documents.forEach((d) => {
      references[d.reference] = d;
    });
  }

  if (references) {
    let counter = 0;
    const refCounter: { [key: string]: number } = {};
    return content.replace(/:cite\[[a-zA-Z0-9, ]+\]/g, (match) => {
      const keys = match.slice(6, -1).split(","); // slice off ":cite[" and "]" then split by comma
      return keys
        .map((key) => {
          const k = key.trim();
          const ref = references[k];
          if (ref) {
            if (!refCounter[k]) {
              counter++;
              refCounter[k] = counter;
            }
            const link = ref.sourceUrl
              ? ref.sourceUrl
              : `${DUST_CLIENT_FACING_URL}/w/${
                  ref.dataSourceWorkspaceId
                }/builder/data-sources/${
                  ref.dataSourceId
                }/upsert?documentId=${encodeURIComponent(ref.documentId)}`;
            return `[${refCounter[k]}](${link})`;
          }
          return "";
        })
        .join(" ");
    });
  }

  return _removeCiteMention(content);
}

function _removeCiteMention(message: string): string {
  const regex = / ?:cite\[[a-zA-Z0-9, ]+\]/g;
  return message.replace(regex, "");
}

export async function getBotEnabled(
  connectorId: ModelId
): Promise<Result<boolean, Error>> {
  const slackConfig = await SlackConfiguration.findOne({
    where: {
      connectorId: connectorId,
    },
  });
  if (!slackConfig) {
    return new Err(
      new Error(
        `Failed to find a Slack configuration for connector ${connectorId}`
      )
    );
  }

  return new Ok(slackConfig.botEnabled);
}

export async function toggleSlackbot(
  connectorId: ModelId,
  botEnabled: boolean
): Promise<Result<void, Error>> {
  const slackConfig = await SlackConfiguration.findOne({
    where: {
      connectorId: connectorId,
    },
  });

  if (!slackConfig) {
    return new Err(
      new Error(
        `Failed to find a Slack configuration for connector ${connectorId}`
      )
    );
  }

  if (botEnabled) {
    const otherSlackConfigWithBotEnabled = await SlackConfiguration.findOne({
      where: {
        slackTeamId: slackConfig.slackTeamId,
        botEnabled: true,
      },
    });

    if (otherSlackConfigWithBotEnabled) {
      return new Err(
        new Error(
          "Another Dust workspace has already enabled the slack bot for your Slack workspace."
        )
      );
    }
  }

  slackConfig.botEnabled = botEnabled;
  await slackConfig.save();

  return new Ok(void 0);
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
    contentType: "slack_thread_content",
    context: null,
  });
}
