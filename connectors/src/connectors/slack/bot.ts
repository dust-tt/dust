import type {
  AgentMessageSuccessEvent,
  APIError,
  ConversationPublicType,
  LightAgentConfigurationType,
  PublicPostContentFragmentRequestBody,
  PublicPostMessagesRequestBody,
  Result,
  SupportedFileContentType,
  UserMessageType,
} from "@dust-tt/client";
import {
  DustAPI,
  Err,
  isSupportedFileContentType,
  Ok,
  removeNulls,
} from "@dust-tt/client";
import type { WebClient } from "@slack/web-api";
import type { MessageElement } from "@slack/web-api/dist/types/response/ConversationsRepliesResponse";
import removeMarkdown from "remove-markdown";
import jaroWinkler from "talisman/metrics/jaro-winkler";

import {
  makeErrorBlock,
  makeMarkdownBlock,
  makeMessageUpdateBlocksAndText,
} from "@connectors/connectors/slack/chat/blocks";
import { streamConversationToSlack } from "@connectors/connectors/slack/chat/stream_conversation_handler";
import { makeConversationUrl } from "@connectors/connectors/slack/chat/utils";
import {
  getBotUserIdMemoized,
  getUserName,
} from "@connectors/connectors/slack/lib/bot_user_helpers";
import {
  isSlackWebAPIPlatformError,
  isWebAPIRateLimitedError,
  SlackExternalUserError,
  SlackMessageError,
} from "@connectors/connectors/slack/lib/errors";
import { formatMessagesForUpsert } from "@connectors/connectors/slack/lib/messages";
import type { SlackUserInfo } from "@connectors/connectors/slack/lib/slack_client";
import {
  getSlackBotInfo,
  getSlackClient,
  getSlackUserInfo,
  reportSlackUsage,
} from "@connectors/connectors/slack/lib/slack_client";
import { getRepliesFromThread } from "@connectors/connectors/slack/lib/thread";
import {
  isBotAllowed,
  notifyIfSlackUserIsNotAllowed,
} from "@connectors/connectors/slack/lib/workspace_limits";
import { apiConfig } from "@connectors/lib/api/config";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import type { CoreAPIDataSourceDocumentSection } from "@connectors/lib/data_sources";
import { sectionFullText } from "@connectors/lib/data_sources";
import { ProviderRateLimitError } from "@connectors/lib/error";
import {
  SlackChannel,
  SlackChatBotMessage,
} from "@connectors/lib/models/slack";
import { createProxyAwareFetch } from "@connectors/lib/proxy";
import { throttleWithRedis } from "@connectors/lib/throttle";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import type { ModelId } from "@connectors/types";
import {
  getHeaderFromGroupIds,
  getHeaderFromUserEmail,
} from "@connectors/types";

const SLACK_RATE_LIMIT_ERROR_MARKDOWN =
  "You have reached a rate limit enforced by Slack. Please try again later (or contact Slack to increase your rate limit on the <https://dust4ai.slack.com/marketplace/A09214D6XQT-dust|Dust App for Slack>).";
const SLACK_ERROR_TEXT =
  "An unexpected error occurred while answering your message, please retry.";

const MAX_FILE_SIZE_TO_UPLOAD = 10 * 1024 * 1024; // 10 MB

type BotAnswerParams = {
  responseUrl?: string;
  slackTeamId: string;
  slackChannel: string;
  slackUserId: string;
  slackBotId?: string;
  slackMessageTs: string;
  slackThreadTs?: string;
};

export async function getSlackConnector(params: BotAnswerParams) {
  const { slackTeamId } = params;

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

  return new Ok({ slackConfig, connector });
}

export async function botAnswerMessage(
  message: string,
  params: BotAnswerParams
): Promise<Result<undefined, Error>> {
  const { slackChannel, slackMessageTs, slackTeamId } = params;
  const connectorRes = await getSlackConnector(params);
  if (connectorRes.isErr()) {
    return connectorRes;
  }
  const { slackConfig, connector } = connectorRes.value;

  try {
    const res = await answerMessage(
      message,
      undefined,
      params,
      connector,
      slackConfig
    );

    await processErrorResult(res, params, connector);

    return new Ok(undefined);
  } catch (e) {
    logger.error(
      {
        error: e,
        connectorId: connector.id,
        slackTeamId,
      },
      "Unexpected exception answering to Slack Chat Bot message"
    );
    if (isSlackWebAPIPlatformError(e) && e.data.error === "message_not_found") {
      // This means that the message has been deleted, so we don't need to send an error message.
      return new Ok(undefined);
    }
    const slackClient = await getSlackClient(connector.id);
    try {
      reportSlackUsage({
        connectorId: connector.id,
        method: "chat.postMessage",
        channelId: slackChannel,
        useCase: "bot",
      });
      if (e instanceof ProviderRateLimitError || isWebAPIRateLimitedError(e)) {
        await slackClient.chat.postMessage({
          channel: slackChannel,
          blocks: makeMarkdownBlock(SLACK_RATE_LIMIT_ERROR_MARKDOWN),
          thread_ts: slackMessageTs,
          unfurl_links: false,
        });
      } else {
        await slackClient.chat.postMessage({
          channel: slackChannel,
          text: SLACK_ERROR_TEXT,
          thread_ts: slackMessageTs,
        });
      }
    } catch (e) {
      logger.error(
        {
          slackChannel,
          slackMessageTs,
          slackTeamId,
          error: e,
        },
        "Failed to post error message to Slack"
      );
    }
    return new Err(new Error("An unexpected error occurred"));
  }
}

export async function botReplaceMention(
  messageId: number,
  mentionOverride: string,
  params: BotAnswerParams
): Promise<Result<undefined, Error>> {
  const { slackChannel, slackMessageTs, slackTeamId } = params;
  const connectorRes = await getSlackConnector(params);
  if (connectorRes.isErr()) {
    return connectorRes;
  }
  const { slackConfig, connector } = connectorRes.value;

  try {
    const slackChatBotMessage = await SlackChatBotMessage.findOne({
      where: { id: messageId },
    });
    if (!slackChatBotMessage) {
      throw new Error("Missing initial message");
    }
    const res = await answerMessage(
      slackChatBotMessage.message,
      mentionOverride,
      params,
      connector,
      slackConfig
    );

    await processErrorResult(res, params, connector);

    return new Ok(undefined);
  } catch (e) {
    logger.error(
      {
        error: e,
        connectorId: connector.id,
        slackTeamId,
      },
      "Unexpected exception updating mention on Chat Bot message"
    );
    const slackClient = await getSlackClient(connector.id);
    reportSlackUsage({
      connectorId: connector.id,
      method: "chat.postMessage",
      channelId: slackChannel,
      useCase: "bot",
    });
    if (e instanceof ProviderRateLimitError) {
      await slackClient.chat.postMessage({
        channel: slackChannel,
        blocks: makeMarkdownBlock(SLACK_RATE_LIMIT_ERROR_MARKDOWN),
        thread_ts: slackMessageTs,
        unfurl_links: false,
      });
    } else {
      await slackClient.chat.postMessage({
        channel: slackChannel,
        text: SLACK_ERROR_TEXT,
        thread_ts: slackMessageTs,
      });
    }
    return new Err(new Error("An unexpected error occurred"));
  }
}

type ToolValidationParams = {
  actionId: string;
  approved: "approved" | "rejected";
  conversationId: string;
  messageId: string;
  slackChatBotMessageId: number;
  text: string;
};

export async function botValidateToolExecution(
  {
    actionId,
    approved,
    conversationId,
    messageId,
    slackChatBotMessageId,
    text,
  }: ToolValidationParams,
  params: BotAnswerParams
) {
  const { slackChannel, slackMessageTs, slackTeamId, responseUrl } = params;

  const connectorRes = await getSlackConnector(params);
  if (connectorRes.isErr()) {
    return connectorRes;
  }
  const { connector } = connectorRes.value;

  try {
    const slackChatBotMessage = await SlackChatBotMessage.findOne({
      where: { id: slackChatBotMessageId },
    });
    if (!slackChatBotMessage) {
      throw new Error("Missing Slack message");
    }

    const dustAPI = new DustAPI(
      { url: apiConfig.getDustFrontAPIUrl() },
      {
        apiKey: connector.workspaceAPIKey,
        // We neither need group ids nor user email headers here because validate tool endpoint is not
        // gated by group ids or user email headers.
        extraHeaders: {},
        workspaceId: connector.workspaceId,
      },
      logger
    );

    const res = await dustAPI.validateAction({
      conversationId,
      messageId,
      actionId,
      approved,
    });

    // Retry blocked actions on the main conversation if it differs from the event's conversation.
    if (
      slackChatBotMessage.conversationId &&
      slackChatBotMessage.conversationId !== conversationId
    ) {
      const retryRes = await dustAPI.retryMessage({
        conversationId,
        messageId,
        blockedOnly: true,
      });

      if (retryRes.isErr()) {
        logger.error(
          {
            error: retryRes.error,
            connectorId: connector.id,
            mainConversationId: slackChatBotMessage.conversationId,
            eventConversationId: conversationId,
            agentMessageId: messageId,
          },
          "Failed to retry blocked actions on the main conversation"
        );
      } else {
        logger.info(
          {
            connectorId: connector.id,
            mainConversationId: slackChatBotMessage.conversationId,
            eventConversationId: conversationId,
            agentMessageId: messageId,
          },
          "Successfully retried blocked actions on the main conversation"
        );
      }
    }

    if (responseUrl) {
      // Use response_url to delete the message
      // Deleting is preferred over updating the message (see https://github.com/dust-tt/dust/pull/13268)
      const proxyFetch = createProxyAwareFetch();
      const response = await proxyFetch(responseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          delete_original: true,
        }),
      });

      if (!response.ok) {
        logger.error(
          {
            responseUrl,
            connectorId: connector.id,
          },
          "Failed to delete original message using response_url"
        );
      }
    }
    const slackClient = await getSlackClient(connector.id);

    reportSlackUsage({
      connectorId: connector.id,
      method: "chat.postEphemeral",
      channelId: slackChannel,
      useCase: "bot",
    });
    await slackClient.chat.postEphemeral({
      channel: slackChannel,
      user: slackChatBotMessage.slackUserId,
      text,
      thread_ts: slackMessageTs,
    });

    return res;
  } catch (e) {
    logger.error(
      {
        error: e,
        connectorId: connector.id,
        slackTeamId,
      },
      "Unexpected exception validating tool execution"
    );
    const slackClient = await getSlackClient(connector.id);

    reportSlackUsage({
      connectorId: connector.id,
      method: "chat.postMessage",
      channelId: slackChannel,
      useCase: "bot",
    });
    await slackClient.chat.postMessage({
      channel: slackChannel,
      text: "An unexpected error occurred while sending the validation. Our team has been notified.",
      thread_ts: slackMessageTs,
    });

    return new Err(new Error("An unexpected error occurred"));
  }
}

async function processErrorResult(
  res: Result<AgentMessageSuccessEvent | undefined, Error>,
  params: BotAnswerParams,
  connector: ConnectorResource
) {
  if (res.isErr()) {
    const { slackChannel, slackMessageTs } = params;
    logger.error(
      {
        error: res.error,
        errorMessage: res.error.message,
        ...params,
      },
      "Failed answering to Slack Chat Bot message"
    );

    const errorMessage =
      res.error instanceof SlackExternalUserError
        ? res.error.message
        : `An error occurred : ${res.error.message}. Our team has been notified and will work on it as soon as possible.`;

    const { slackChatBotMessage, mainMessage } =
      res.error instanceof SlackMessageError
        ? res.error
        : { mainMessage: undefined, slackChatBotMessage: undefined };

    const conversationUrl = makeConversationUrl(
      connector.workspaceId,
      slackChatBotMessage?.conversationId
    );

    const slackClient = await getSlackClient(connector.id);

    const errorPost = makeErrorBlock(
      conversationUrl,
      connector.workspaceId,
      errorMessage
    );
    if (mainMessage && mainMessage.ts) {
      reportSlackUsage({
        connectorId: connector.id,
        method: "chat.update",
        channelId: slackChannel,
        useCase: "bot",
      });

      const mainMessageTs = mainMessage.ts;

      await throttleWithRedis(
        50,
        `${connector.id}-chat-update`,
        false,
        async () =>
          slackClient.chat.update({
            ...errorPost,
            channel: slackChannel,
            ts: mainMessageTs,
          })
      );
    } else {
      reportSlackUsage({
        connectorId: connector.id,
        method: "chat.postMessage",
        channelId: slackChannel,
        useCase: "bot",
      });
      await slackClient.chat.postMessage({
        ...errorPost,
        channel: slackChannel,
        thread_ts: slackMessageTs,
      });
    }
  } else {
    logger.info(
      {
        connectorId: connector.id,
        ...params,
      },
      "Successfully answered to Slack Chat Bot message"
    );
  }
}

async function answerMessage(
  message: string,
  mentionOverride: string | undefined,
  {
    slackTeamId,
    slackChannel,
    slackUserId,
    slackBotId,
    slackMessageTs,
    slackThreadTs,
  }: BotAnswerParams,
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
    try {
      slackUserInfo = await getSlackUserInfo(
        connector.id,
        slackClient,
        slackUserId
      );
    } catch (e) {
      if (isSlackWebAPIPlatformError(e)) {
        logger.error(
          {
            error: e,
            connectorId: connector.id,
            slackUserId,
          },
          "Failed to get slack user info"
        );
      }
      throw e;
    }
  } else if (slackBotId) {
    try {
      slackUserInfo = await getSlackBotInfo(
        connector.id,
        slackClient,
        slackBotId
      );
    } catch (e) {
      if (isSlackWebAPIPlatformError(e)) {
        logger.error(
          {
            error: e,
            connectorId: connector.id,
            slackUserId,
            slackBotId,
            slackTeamId,
          },
          "Failed to get slack bot info"
        );
        if (e.data.error === "bot_not_found") {
          // We received a bot message from a bot that is not accessible to us. We log and ignore
          // the message.
          logger.warn(
            {
              error: e,
              connectorId: connector.id,
              slackUserId,
              slackBotId,
              slackTeamId,
            },
            "Received bot_not_found"
          );
          return new Ok(undefined);
        }
      }
      throw e;
    }
  }

  if (!slackUserInfo) {
    throw new Error("Failed to get slack user info");
  }

  let requestedGroups: string[] | undefined = undefined;
  let skipToolsValidation = false;

  if (slackUserInfo.is_bot) {
    const isBotAllowedRes = await isBotAllowed(connector, slackUserInfo);
    if (isBotAllowedRes.isErr()) {
      if (slackUserInfo.real_name === "Dust Data Sync") {
        // The Dust Data Sync bot mentions Dust to let ther user know which bot to use so we should
        // not react to it.
        return new Ok(undefined);
      }
      return isBotAllowedRes;
    }
    // If the bot is allowed, we skip tools validation as we have no users to rely on for
    // permissions.
    skipToolsValidation = true;
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
    if (!hasChatbotAccess.authorized) {
      return new Ok(undefined);
    }

    // If the user is allowed, we retrieve the groups he has access to.
    requestedGroups = hasChatbotAccess.groupIds;
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
    threadTs: slackThreadTs || slackMessageTs,
    conversationId: lastSlackChatBotMessage?.conversationId,
    userType: slackUserInfo.is_bot ? "bot" : "user",
  });

  if (slackUserInfo.is_bot) {
    const botName = slackUserInfo.real_name;
    requestedGroups = await slackConfig.getBotGroupIds(botName);
  }

  const userEmailHeader =
    slackChatBotMessage.slackEmail !== "unknown"
      ? slackChatBotMessage.slackEmail
      : undefined;

  const dustAPI = new DustAPI(
    { url: apiConfig.getDustFrontAPIUrl() },
    {
      workspaceId: connector.workspaceId,
      apiKey: connector.workspaceAPIKey,
      extraHeaders: {
        ...getHeaderFromGroupIds(requestedGroups),
        ...getHeaderFromUserEmail(userEmailHeader),
      },
    },
    logger
  );

  // Do not await this promise, we want to continue the execution of the function in parallel.
  const buildContentFragmentPromise = makeContentFragments(
    slackClient,
    dustAPI,
    slackChannel,
    slackThreadTs || slackMessageTs,
    lastSlackChatBotMessage?.messageTs || slackThreadTs || slackMessageTs,
    connector,
    lastSlackChatBotMessage?.conversationId || null,
    slackBotId // If we reach that line with a slackBotId, it means that the message is from an allowed Slack workflow bot.
  );

  buildContentFragmentPromise.catch((error) => {
    // To avoid silently failing, we log the error here.
    logger.error(
      {
        error,
        connectorId: connector.id,
        slackTeamId,
      },
      "Error in buildContentFragmentPromise"
    );
  });

  const agentConfigurationsRes = await dustAPI.getAgentConfigurations({});
  if (agentConfigurationsRes.isErr()) {
    return new Err(new Error(agentConfigurationsRes.error.message));
  }

  const activeAgentConfigurations = agentConfigurationsRes.value.filter(
    (ac) => ac.status === "active"
  );

  // Slack sends the message with user ids when someone is mentioned (bot or user).
  // Here we remove the bot id from the message and we replace user ids by their display names.
  // Example: <@U01J9JZQZ8Z> What is the command to upgrade a workspace in production (cc
  // <@U91J1JEQZ1A>) ?
  // becomes: What is the command to upgrade a workspace in production (cc @julien) ?
  const matches = message.match(/<@[A-Z-0-9]+>/g);
  if (matches) {
    const mySlackUser = await getBotUserIdMemoized(slackClient, connector.id);
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

  let mention: { assistantName: string; assistantId: string } | undefined;

  // Extract all ~mentions and +mentions
  const mentionCandidates =
    messageWithoutMarkdown.match(
      /(?<!\S)[+~]([a-zA-Z0-9_-]{1,40})(?=\s|,|\.|$)/g
    ) || [];

  // First we look at mention override
  // (eg: a mention coming from the Slack agent picker from slack).
  if (mentionOverride) {
    const agentConfig = activeAgentConfigurations.find(
      (ac) => ac.sId === mentionOverride
    );
    if (agentConfig) {
      // Removing all previous mentions
      for (const mc of mentionCandidates) {
        message = message.replace(mc, "");
      }
      mention = {
        assistantId: agentConfig.sId,
        assistantName: agentConfig.name,
      };
    } else {
      return new Err(new SlackExternalUserError("Cannot find selected agent."));
    }
  }

  if (mentionCandidates.length > 1) {
    return new Err(
      new SlackExternalUserError(
        "Only one agent at a time can be called through Slack."
      )
    );
  }

  const [mentionCandidate] = mentionCandidates;
  if (!mention && mentionCandidate) {
    let bestCandidate:
      | {
          assistantId: string;
          assistantName: string;
          distance: number;
        }
      | undefined = undefined;
    for (const agentConfiguration of activeAgentConfigurations) {
      const distance =
        1 -
        jaroWinkler(
          mentionCandidate.slice(1).toLowerCase(),
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
      mention = {
        assistantId: bestCandidate.assistantId,
        assistantName: bestCandidate.assistantName,
      };
      message = message.replace(
        mentionCandidate,
        `:mention[${bestCandidate.assistantName}]{sId=${bestCandidate.assistantId}}`
      );
    } else {
      return new Err(
        new SlackExternalUserError(
          `Assistant ${mentionCandidate} has not been found.`
        )
      );
    }
  }

  if (!mention) {
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
        activeAgentConfigurations.find(
          (ac) => ac.sId === channel.agentConfigurationId
        ) || null;
    }

    if (agentConfigurationToMention) {
      mention = {
        assistantId: agentConfigurationToMention.sId,
        assistantName: agentConfigurationToMention.name,
      };
    } else {
      // If no mention is found and no channel-based routing rule is found, we use the default agent.
      let defaultAssistant: LightAgentConfigurationType | null = null;
      defaultAssistant =
        activeAgentConfigurations.find((ac) => ac.sId === "dust") || null;
      if (!defaultAssistant || defaultAssistant.status !== "active") {
        defaultAssistant =
          activeAgentConfigurations.find((ac) => ac.sId === "gpt-4") || null;
      }
      if (!defaultAssistant) {
        return new Err(
          // not actually reachable, gpt-4 cannot be disabled.
          new SlackExternalUserError(
            "No agent has been configured to reply on Slack."
          )
        );
      }
      mention = {
        assistantId: defaultAssistant.sId,
        assistantName: defaultAssistant.name,
      };
    }
  }

  const mostPopularAgentConfigurations = [...activeAgentConfigurations]
    .sort((a, b) => (b.usage?.messageCount ?? 0) - (a.usage?.messageCount ?? 0))
    .splice(0, 100)
    .sort((a, b) => a.name.localeCompare(b.name));

  // Check if agent is from a restricted space
  if (!slackConfig.restrictedSpaceAgentsEnabled) {
    const isRestrictedRes = await isAgentAccessingRestrictedSpace(
      dustAPI,
      activeAgentConfigurations,
      mention.assistantId
    );

    if (isRestrictedRes.isErr()) {
      logger.error(
        {
          error: isRestrictedRes.error,
          agentId: mention.assistantId,
          connectorId: connector.id,
        },
        "Error determining if agent is from restricted space"
      );
      return isRestrictedRes;
    }

    // If agent is from a restricted space, we send an error message to Slack
    if (isRestrictedRes.value) {
      const errorMsg = new RestrictedSpaceAgentError();
      const errorBlock = makeErrorBlock(
        null, // No conversation URL for this error
        connector.workspaceId,
        errorMsg.message
      );

      await slackClient.chat.postMessage({
        ...errorBlock,
        channel: slackChannel,
        thread_ts: slackMessageTs,
      });

      return new Ok(undefined);
    }
  }

  const mainMessage = await slackClient.chat.postMessage({
    ...makeMessageUpdateBlocksAndText(null, connector.workspaceId, {
      assistantName: mention.assistantName,
      agentConfigurations: mostPopularAgentConfigurations,
      isThinking: true,
    }),
    channel: slackChannel,
    thread_ts: slackMessageTs,
    metadata: {
      event_type: "user_message",
      event_payload: {
        message_id: slackChatBotMessage.id,
      },
    },
  });

  const buildSlackMessageError = (
    errRes: Err<Error | APIError>,
    errorKind:
      | "buildContentFragment"
      | "postContentFragment"
      | "getConversation"
      | "createConversation"
      | "postUserMessage"
      | "streamConversationToSlack"
  ) => {
    logger.error(
      {
        error: errRes.error,
        errorKind,
        connectorId: connector.id,
        slackTeamId,
      },
      "slackBot response error"
    );
    return new Err(
      new SlackMessageError(
        errRes.error.message,
        slackChatBotMessage.get(),
        mainMessage
      )
    );
  };

  if (!message.includes(":mention")) {
    // if the message does not contain the mention, we add it as a prefix.
    message = `:mention[${mention.assistantName}]{sId=${mention.assistantId}} ${message}`;
  }

  const messageReqBody: PublicPostMessagesRequestBody = {
    content: message,
    mentions: [{ configurationId: mention.assistantId }],
    context: {
      timezone: slackChatBotMessage.slackTimezone || "Europe/Paris",
      username: slackChatBotMessage.slackUserName,
      fullName:
        slackChatBotMessage.slackFullName || slackChatBotMessage.slackUserName,
      email: slackChatBotMessage.slackEmail,
      profilePictureUrl: slackChatBotMessage.slackAvatar || null,
      origin: "slack" as const,
    },
    skipToolsValidation,
  };

  // Await the promise to get the content fragment.
  const buildContentFragmentRes = await buildContentFragmentPromise;

  if (buildContentFragmentRes.isErr()) {
    return buildSlackMessageError(
      buildContentFragmentRes,
      "buildContentFragment"
    );
  }

  let conversation: ConversationPublicType | undefined = undefined;
  let userMessage: UserMessageType | undefined = undefined;

  if (lastSlackChatBotMessage?.conversationId) {
    // Check conversation existence (it might have been deleted between two messages).
    const existsRes = await dustAPI.getConversation({
      conversationId: lastSlackChatBotMessage.conversationId,
    });

    // If it doesn't exists, we will create a new one later.
    if (existsRes.isOk()) {
      if (buildContentFragmentRes.value) {
        for (const cf of buildContentFragmentRes.value) {
          const contentFragmentRes = await dustAPI.postContentFragment({
            conversationId: lastSlackChatBotMessage.conversationId,
            contentFragment: cf,
          });
          if (contentFragmentRes.isErr()) {
            return buildSlackMessageError(
              contentFragmentRes,
              "postContentFragment"
            );
          }
        }
      }

      const messageRes = await dustAPI.postUserMessage({
        conversationId: lastSlackChatBotMessage.conversationId,
        message: messageReqBody,
      });
      if (messageRes.isErr()) {
        return buildSlackMessageError(messageRes, "postUserMessage");
      }
      userMessage = messageRes.value;

      const conversationRes = await dustAPI.getConversation({
        conversationId: lastSlackChatBotMessage.conversationId,
      });
      if (conversationRes.isErr()) {
        return buildSlackMessageError(conversationRes, "getConversation");
      }
      conversation = conversationRes.value;
    }
  }

  if (!conversation || !userMessage) {
    const convRes = await dustAPI.createConversation({
      title: null,
      visibility: "unlisted",
      message: messageReqBody,
      contentFragments: buildContentFragmentRes.value || undefined,
    });
    if (convRes.isErr()) {
      return buildSlackMessageError(convRes, "createConversation");
    }

    conversation = convRes.value.conversation;
    userMessage = convRes.value.message;

    if (!userMessage) {
      return buildSlackMessageError(
        new Err(new Error("Failed to retrieve the created message.")),
        "createConversation"
      );
    }

    slackChatBotMessage.conversationId = conversation.sId;
    await slackChatBotMessage.save();
  }

  const streamRes = await streamConversationToSlack(dustAPI, {
    assistantName: mention.assistantName,
    connector,
    conversation,
    mainMessage,
    slack: {
      slackChannelId: slackChannel,
      slackClient,
      slackMessageTs,
      slackUserInfo,
      slackUserId,
    },
    userMessage,
    slackChatBotMessage,
    agentConfigurations: mostPopularAgentConfigurations,
  });

  // Immediately mark the conversation as read.
  await dustAPI.markAsRead({ conversationId: conversation.sId });

  if (streamRes.isErr()) {
    return buildSlackMessageError(streamRes, "streamConversationToSlack");
  }

  return streamRes;
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

async function makeContentFragments(
  slackClient: WebClient,
  dustAPI: DustAPI,
  channelId: string,
  threadTs: string,
  startingAtTs: string | null,
  connector: ConnectorResource,
  conversationId: string | null,
  allowedSlackBotId: string | undefined // Slack workflow bot message should be taken into account.
): Promise<Result<PublicPostContentFragmentRequestBody[] | null, Error>> {
  const allContentFragments: PublicPostContentFragmentRequestBody[] = [];
  let allMessages: MessageElement[] = [];

  const slackBotMessages = await SlackChatBotMessage.findAll({
    where: {
      connectorId: connector.id,
      channelId: channelId,
      threadTs: threadTs,
    },
  });

  const replies = await getRepliesFromThread({
    connectorId: connector.id,
    slackClient,
    channelId,
    threadTs,
    useCase: "bot",
  });

  let shouldTake = false;
  for (const reply of replies) {
    if (reply.ts === startingAtTs) {
      // Signal that we must take all the messages starting from this one.
      shouldTake = true;
    }

    const isFromAllowedBot =
      allowedSlackBotId && reply.bot_id === allowedSlackBotId;
    // Message is not from a user or an allowed bot, so we skip it.
    if (!reply.user && !isFromAllowedBot) {
      continue;
    }
    if (shouldTake) {
      allMessages.push(reply);
    }
  }

  const supportedFiles = removeNulls(
    allMessages.filter((m) => m.files).flatMap((m) => m.files)
  ).filter(
    (f) =>
      isSupportedFileContentType(f.mimetype ?? "") &&
      !!f.size &&
      !!f.url_private_download &&
      f.size <= MAX_FILE_SIZE_TO_UPLOAD
  );

  if (supportedFiles.length > 0) {
    logger.info({ conversationId }, "Found supported files, uploading them.");

    // Download the files and upload them to the conversation.
    const proxyFetch = createProxyAwareFetch();
    for (const f of supportedFiles) {
      const response = await proxyFetch(f.url_private_download!, {
        headers: {
          Authorization: `Bearer ${slackClient.token}`,
        },
      });

      // Ensure we got a successful response and that it's not an html file (redirection from slack)
      if (
        !response.ok ||
        response.headers.get("content-type")?.includes("html")
      ) {
        logger.warn(
          {
            file: f,
            error: response,
          },
          "Failed to download slack file. Could be a scope issue as workspace need to re-authorize the app for files."
        );
        continue;
      }

      const fileContent = Buffer.from(await response.arrayBuffer());

      const fileName = f.name || f.title || "notitle";

      const fileRes = await dustAPI.uploadFile({
        contentType: f.mimetype as SupportedFileContentType,
        fileName: fileName,
        fileSize: f.size!,
        useCase: "conversation",
        useCaseMetadata: conversationId ? { conversationId } : undefined,
        fileObject: new File([fileContent], fileName, {
          type: f.mimetype,
        }),
      });

      if (fileRes.isErr()) {
        // We log an error, but we continue the loop to try to upload the other files.
        // The only stopping error is if the thread content can not be uploaded. (see below)
        logger.error(
          {
            file: f,
            conversationId,
            error: fileRes.error,
          },
          "Failed to upload slack file to conversation"
        );
        continue;
      } else {
        allContentFragments.push({
          title: fileName,
          url: fileRes.value.publicUrl,
          fileId: fileRes.value.sId,
          context: null,
        });
      }
    }
  }

  const botUserId = await getBotUserIdMemoized(slackClient, connector.id);
  allMessages = allMessages.filter(
    (m) =>
      // If this message is from the bot, we don't send it as a content fragment.
      m.user !== botUserId &&
      // If this message is a mention to the bot, we don't send it as a content fragment.
      !slackBotMessages.find((sbm) => sbm.messageTs === m.ts)
  );

  let channelName: string | null = null;
  try {
    reportSlackUsage({
      connectorId: connector.id,
      method: "conversations.info",
      channelId: channelId,
      useCase: "bot",
    });
    const channel = await slackClient.conversations.info({
      channel: channelId,
    });

    if (channel.error) {
      throw new Error(`Could not retrieve channel name: ${channel.error}`);
    }
    if (!channel.channel || !channel.channel.name) {
      if (channel.channel?.is_im || channel.channel?.is_mpim) {
        channelName = "Direct Message";
      } else {
        throw new Error(
          "Could not retrieve channel name while the response was successful"
        );
      }
    } else {
      channelName = channel.channel.name;
    }
  } catch (e) {
    // We were missing the "im:read" scope, so we fallback to the "Unknown" channel name
    // because we would trigger an oauth error otherwise.
    // We now ask for the "im:read" scope since 17/02/2025
    // We can remove this fallback in a few months.
    channelName = "Unknown";
    logger.warn(
      {
        error: e,
      },
      "Failed to retrieve channel name"
    );
  }

  let document: CoreAPIDataSourceDocumentSection | null = null;
  let url: string | null = null;
  if (allMessages.length === 0) {
    reportSlackUsage({
      connectorId: connector.id,
      method: "chat.getPermalink",
      channelId: channelId,
      useCase: "bot",
    });
    const permalinkRes = await slackClient.chat.getPermalink({
      channel: channelId,
      message_ts: threadTs,
    });
    if (!permalinkRes.ok || !permalinkRes.permalink) {
      return new Err(new Error(permalinkRes.error));
    }
    url = permalinkRes.permalink;
  } else {
    document = await formatMessagesForUpsert({
      dataSourceConfig: dataSourceConfigFromConnector(connector),
      channelName: channelName,
      messages: allMessages,
      isThread: true,
      connectorId: connector.id,
      slackClient,
    });

    if (allMessages[0]?.ts) {
      reportSlackUsage({
        connectorId: connector.id,
        method: "chat.getPermalink",
        channelId: channelId,
        useCase: "bot",
      });
      const permalinkRes = await slackClient.chat.getPermalink({
        channel: channelId,
        message_ts: allMessages[0].ts,
      });
      if (!permalinkRes.ok || !permalinkRes.permalink) {
        return new Err(new Error(permalinkRes.error));
      }
      url = permalinkRes.permalink;
    }
  }

  // Prepend $url to the content to make it available to the model.
  const section = document
    ? `$url: ${url}\n${sectionFullText(document)}`
    : `$url: ${url}\nNo messages previously sent in this thread.`;

  const contentType = "text/vnd.dust.attachment.slack.thread";
  const fileName = `slack_thread-${channelName}-${threadTs}.txt`;

  const blob = new Blob([section]);
  const fileSize = blob.size;

  const fileRes = await dustAPI.uploadFile({
    contentType,
    fileName,
    fileSize: fileSize,
    useCase: "conversation",
    useCaseMetadata: conversationId ? { conversationId } : undefined,
    fileObject: new File([blob], fileName, { type: contentType }),
  });

  if (fileRes.isErr()) {
    return new Err(new Error(fileRes.error.message));
  }

  allContentFragments.push({
    title: `Thread content from #${channelName}`,
    url: url,
    fileId: fileRes.value.sId,
    context: null,
  });

  return new Ok(allContentFragments);
}

class RestrictedSpaceAgentError extends Error {
  constructor() {
    super(
      "This agent belongs to a restricted space and cannot be invoked on Slack for this workspace. Contact your workspace administrator if you need access."
    );
    this.name = "RestrictedSpaceAgentError";
  }
}

async function isAgentAccessingRestrictedSpace(
  dustAPI: DustAPI,
  activeAgentConfigurations: LightAgentConfigurationType[],
  agentId: string
): Promise<Result<boolean, Error>> {
  try {
    const agent = activeAgentConfigurations.find((ac) => ac.sId === agentId);
    if (!agent) {
      logger.warn(
        { agentId },
        "Agent not found when checking for restricted space"
      );
      return new Err(new Error(`Agent ${agentId} not found`));
    }

    // If the agent has no requestedGroupIds, it's not from a restricted space
    if (!agent.requestedGroupIds || agent.requestedGroupIds.length === 0) {
      return new Ok(false);
    }

    const agentGroupIds = agent.requestedGroupIds.flat();

    const spacesRes = await dustAPI.getSpaces();
    if (spacesRes.isErr()) {
      logger.error(
        { error: spacesRes.error, agentId },
        "Error fetching spaces when checking for restricted space"
      );
      return new Err(
        new Error(`Error fetching spaces: ${spacesRes.error.message}`)
      );
    }

    // Check if any of the agent's group IDs match with groups from restricted spaces
    const restrictedSpaces = spacesRes.value.filter(
      (space) => space.isRestricted
    );
    const isFromRestrictedSpace = restrictedSpaces.some((space) => {
      return space.groupIds.some((groupId) => agentGroupIds.includes(groupId));
    });

    logger.info(
      {
        agentId,
        isRestricted: isFromRestrictedSpace,
      },
      "Checked if agent is from restricted space"
    );

    return new Ok(isFromRestrictedSpace);
  } catch (error) {
    logger.error(
      { error, agentId },
      "Error checking if agent is from restricted space"
    );
    return new Err(
      new Error(
        `Error checking if agent ${agentId} is from restricted space: ${error}`
      )
    );
  }
}
