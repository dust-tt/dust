import type {
  AgentActionPublicType,
  ConversationPublicType,
  DustAPI,
  LightAgentConfigurationType,
  Result,
  UserMessageType,
} from "@dust-tt/client";
import {
  assertNever,
  Err,
  isMCPServerPersonalAuthRequiredError,
  Ok,
  TOOL_RUNNING_LABEL,
} from "@dust-tt/client";
import type { ChatPostMessageResponse, WebClient } from "@slack/web-api";
import * as t from "io-ts";
import slackifyMarkdown from "slackify-markdown";

import type { SlackMessageUpdate } from "@connectors/connectors/slack/chat/blocks";
import {
  makeAssistantSelectionBlock,
  makeMarkdownBlock,
  makeMessageUpdateBlocksAndText,
  makeToolValidationBlock,
  MAX_SLACK_MESSAGE_LENGTH,
} from "@connectors/connectors/slack/chat/blocks";
import type { SlackMessageFootnotes } from "@connectors/connectors/slack/chat/citations";
import { annotateCitations } from "@connectors/connectors/slack/chat/citations";
import { makeConversationUrl } from "@connectors/connectors/slack/chat/utils";
import type { SlackUserInfo } from "@connectors/connectors/slack/lib/slack_client";
import type { SlackChatBotMessage } from "@connectors/lib/models/slack";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

export const SlackBlockIdStaticAgentConfigSchema = t.type({
  slackChatBotMessageId: t.number,
  messageTs: t.union([t.string, t.undefined]),
  slackThreadTs: t.union([t.string, t.undefined]),
  botId: t.union([t.string, t.undefined]),
});

export const SlackBlockIdToolValidationSchema = t.intersection([
  SlackBlockIdStaticAgentConfigSchema,
  t.type({
    actionId: t.string,
    conversationId: t.string,
    messageId: t.string,
    workspaceId: t.string,
  }),
]);

interface StreamConversationToSlackParams {
  assistantName: string;
  connector: ConnectorResource;
  conversation: ConversationPublicType;
  mainMessage: ChatPostMessageResponse;
  slack: {
    slackChannelId: string;
    slackClient: WebClient;
    slackMessageTs: string;
    slackUserInfo: SlackUserInfo;
    slackUserId: string | null;
  };
  userMessage: UserMessageType;
  slackChatBotMessage: SlackChatBotMessage;
  agentConfigurations: LightAgentConfigurationType[];
  enableMessageSplitting?: boolean;
  structuredOutputConfig?: {
    enabled: boolean;
    reactionTarget?: { channelId: string; timestamp: string };
  };
}

// Adding linear backoff mechanism.
const maxBackoffTime = 10_000; // Maximum backoff time.
const initialBackoffTime = 1_000;

/**
 * Handles streaming token processing with configurable behavior.
 * Uses message splitting when enabled, otherwise uses length checking.
 */
async function handleStreamingTokens({
  slackContent,
  footnotes,
  assistantName,
  agentConfigurations,
  conversationData,
  slackClient,
  slackChannelId,
  slackChatBotMessage,
  mainMessage,
  connector,
  conversation,
}: {
  slackContent: string;
  footnotes: SlackMessageFootnotes;
  assistantName: string;
  agentConfigurations: LightAgentConfigurationType[];
  conversationData: StreamConversationToSlackParams;
  slackClient: WebClient;
  slackChannelId: string;
  slackChatBotMessage: SlackChatBotMessage;
  mainMessage: ChatPostMessageResponse;
  connector: ConnectorResource;
  conversation: ConversationPublicType;
}): Promise<void> {
  if (conversationData.enableMessageSplitting) {
    await postSlackMessagesWithSplitting(slackClient, {
      channelId: slackChannelId,
      threadTs: slackChatBotMessage.threadTs || (mainMessage.ts as string),
      content: slackContent,
      mainMessageTs: mainMessage.ts as string,
      conversationUrl: makeConversationUrl(
        connector.workspaceId,
        conversation.sId
      ),
      workspaceId: connector.workspaceId,
      assistantName,
      footnotes,
    });
  } else {
    if (slackContent.length > MAX_SLACK_MESSAGE_LENGTH) {
      return;
    }
    await postSlackMessageUpdate({
      messageUpdate: {
        text: slackContent,
        assistantName,
        agentConfigurations,
        footnotes,
      },
      ...conversationData,
    });
  }
}

async function handleFinalMessage({
  finalAnswer,
  actions,
  assistantName,
  agentConfigurations,
  conversationData,
  slackClient,
  slackChannelId,
  slackChatBotMessage,
  mainMessage,
  connector,
  conversation,
}: {
  finalAnswer: string;
  actions: AgentActionPublicType[];
  assistantName: string;
  agentConfigurations: LightAgentConfigurationType[];
  conversationData: StreamConversationToSlackParams;
  slackClient: WebClient;
  slackChannelId: string;
  slackChatBotMessage: SlackChatBotMessage;
  mainMessage: ChatPostMessageResponse;
  connector: ConnectorResource;
  conversation: ConversationPublicType;
}): Promise<void> {
  let processedText = finalAnswer;
  let reactionName: string | null = null;

  // Handle structured output parsing if enabled
  if (conversationData.structuredOutputConfig?.enabled) {
    const parsedOutput = parseStructuredOutput(finalAnswer);
    processedText = parsedOutput.cleanedText;
    reactionName = parsedOutput.reactionName;
  }

  // Process content and prepare for Slack
  const { formattedContent, footnotes } = annotateCitations(
    processedText,
    actions
  );
  const slackContent = slackifyMarkdown(
    normalizeContentForSlack(formattedContent)
  );

  // Send message using appropriate method
  if (conversationData.enableMessageSplitting) {
    // Use message splitting (handles long messages automatically)
    await postSlackMessagesWithSplitting(slackClient, {
      channelId: slackChannelId,
      threadTs: slackChatBotMessage.threadTs || (mainMessage.ts as string),
      content: slackContent,
      mainMessageTs: mainMessage.ts as string,
      conversationUrl: makeConversationUrl(
        connector.workspaceId,
        conversation.sId
      ),
      workspaceId: connector.workspaceId,
      assistantName,
      footnotes,
    });
  } else {
    await postSlackMessageUpdate(
      {
        messageUpdate: {
          text: slackContent,
          assistantName,
          agentConfigurations,
          footnotes,
        },
        ...conversationData,
      },
      { adhereToRateLimit: false }
    );
  }

  // Handle reaction posting if structured output is enabled and reaction is specified
  if (
    reactionName &&
    conversationData.structuredOutputConfig?.enabled &&
    conversationData.structuredOutputConfig.reactionTarget
  ) {
    const emoji = reactionName.replace(/:/g, "");
    try {
      await slackClient.reactions.add({
        channel:
          conversationData.structuredOutputConfig.reactionTarget.channelId,
        timestamp:
          conversationData.structuredOutputConfig.reactionTarget.timestamp,
        name: emoji,
      });
    } catch (e) {
      // Best-effort; ignore reaction errors
    }
  }
}

/**
 * Posts multiple messages in a Slack thread when content exceeds length limits.
 * Updates the main message and posts additional messages as needed.
 */
async function postSlackMessagesWithSplitting(
  slackClient: WebClient,
  {
    channelId,
    threadTs,
    content,
    mainMessageTs,
    conversationUrl,
    workspaceId,
    assistantName,
    footnotes,
  }: {
    channelId: string;
    threadTs: string;
    content: string;
    mainMessageTs: string;
    conversationUrl: string | null;
    workspaceId: string;
    assistantName?: string;
    footnotes?: SlackMessageFootnotes;
  }
): Promise<void> {
  const contentChunks = splitContentForSlack(content);

  await slackClient.chat.update({
    ...makeMessageUpdateBlocksAndText(conversationUrl, workspaceId, {
      text: content,
      assistantName: assistantName || "Assistant",
      agentConfigurations: [],
      footnotes: contentChunks.length > 1 ? [] : footnotes, // Only add footnotes to last message
    }),
    channel: channelId,
    ts: mainMessageTs,
  });

  if (contentChunks.length > 1) {
    for (let i = 1; i < contentChunks.length; i++) {
      await slackClient.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        blocks: makeMarkdownBlock(contentChunks[i]),
        text: contentChunks[i],
        unfurl_links: false,
      });
    }

    // If we have footnotes, add them to a final message
    if (footnotes && footnotes.length > 0) {
      await slackClient.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        blocks: makeMarkdownBlock(
          `\n\n_Sources:_\n${footnotes.map((f, idx) => `${idx + 1}. ${f.text}`).join("\n")}`
        ),
        text: `Sources: ${footnotes.map((f) => f.text).join(", ")}`,
        unfurl_links: false,
      });
    }
  }
}

export async function streamConversationToSlack(
  dustAPI: DustAPI,
  conversationData: StreamConversationToSlackParams
): Promise<Result<undefined, Error>> {
  const { assistantName, agentConfigurations } = conversationData;

  // Immediately post the conversation URL once available.
  await postSlackMessageUpdate(
    {
      messageUpdate: {
        isThinking: true,
        assistantName,
        agentConfigurations,
      },
      ...conversationData,
    },
    { adhereToRateLimit: false }
  );

  return streamAgentAnswerToSlack(dustAPI, conversationData);
}

class SlackAnswerRetryableError extends Error {
  constructor(message: string) {
    super(message);
  }
}

async function streamAgentAnswerToSlack(
  dustAPI: DustAPI,
  conversationData: StreamConversationToSlackParams
) {
  const {
    assistantName,
    conversation,
    mainMessage,
    userMessage,
    slackChatBotMessage,
    agentConfigurations,
    slack,
    connector,
  } = conversationData;

  const {
    slackChannelId,
    slackClient,
    slackMessageTs,
    slackUserInfo,
    slackUserId,
  } = slack;

  const streamRes = await dustAPI.streamAgentAnswerEvents({
    conversation,
    userMessageId: userMessage.sId,
  });

  if (streamRes.isErr()) {
    return new Err(new Error(streamRes.error.message));
  }

  let answer = "";
  const actions: AgentActionPublicType[] = [];
  for await (const event of streamRes.value.eventStream) {
    switch (event.type) {
      case "tool_params":
      case "tool_notification":
        await postSlackMessageUpdate(
          {
            messageUpdate: {
              isThinking: true,
              assistantName,
              agentConfigurations,
              text: answer,
              thinkingAction: TOOL_RUNNING_LABEL,
            },
            ...conversationData,
          },
          { adhereToRateLimit: false }
        );

        break;

      case "tool_approve_execution": {
        logger.info(
          {
            connectorId: connector.id,
            conversationId: conversation.sId,
            messageId: event.messageId,
            actionId: event.actionId,
            toolName: event.metadata.toolName,
            agentName: event.metadata.agentName,
          },
          "Tool validation request"
        );

        const blockId = SlackBlockIdToolValidationSchema.encode({
          workspaceId: connector.workspaceId,
          conversationId: conversation.sId,
          messageId: event.messageId,
          actionId: event.actionId,
          slackThreadTs: mainMessage.message?.thread_ts,
          messageTs: mainMessage.message?.ts,
          botId: mainMessage.message?.bot_id,
          slackChatBotMessageId: slackChatBotMessage.id,
        });

        if (slackUserId && !slackUserInfo.is_bot) {
          await slackClient.chat.postEphemeral({
            channel: slackChannelId,
            user: slackUserId,
            text: "Approve tool execution",
            blocks: makeToolValidationBlock({
              agentName: event.metadata.agentName,
              toolName: event.metadata.toolName,
              id: JSON.stringify(blockId),
            }),
            thread_ts: slackMessageTs,
          });
        }
        break;
      }

      case "user_message_error": {
        return new Err(
          new Error(
            `User message error: code: ${event.error.code} message: ${event.error.message}`
          )
        );
      }
      case "tool_error": {
        if (isMCPServerPersonalAuthRequiredError(event.error)) {
          const conversationUrl = makeConversationUrl(
            connector.workspaceId,
            conversation.sId
          );
          await postSlackMessageUpdate({
            messageUpdate: {
              text:
                "The agent took an action that requires personal authentication. " +
                `Please go to <${conversationUrl}|the conversation> to authenticate.`,
              assistantName,
              agentConfigurations,
            },
            ...conversationData,
          });
          return new Ok(undefined);
        }
        return new Err(
          new Error(
            `Tool message error: code: ${event.error.code} message: ${event.error.message}`
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

      case "agent_action_success": {
        actions.push(event.action);
        break;
      }

      case "generation_tokens": {
        if (event.classification !== "tokens") {
          continue;
        }

        answer += event.text;

        const { formattedContent, footnotes } = annotateCitations(
          answer,
          actions
        );
        const slackContent = safelyPrepareAnswer(formattedContent);
        // If the answer cannot be prepared safely, skip processing these tokens.
        if (!slackContent) {
          break;
        }

        await handleStreamingTokens({
          slackContent,
          footnotes,
          assistantName,
          agentConfigurations,
          conversationData,
          slackClient,
          slackChannelId,
          slackChatBotMessage,
          mainMessage,
          connector,
          conversation,
        });
        break;
      }

      case "agent_message_success": {
        const finalAnswer = event.message.content ?? "";
        const actions = event.message.actions;

        await handleFinalMessage({
          finalAnswer,
          actions,
          assistantName,
          agentConfigurations,
          conversationData,
          slackClient,
          slackChannelId,
          slackChatBotMessage,
          mainMessage,
          connector,
          conversation,
        });
        if (
          slackUserId &&
          !slackUserInfo.is_bot &&
          agentConfigurations.length > 0
        ) {
          const blockId = SlackBlockIdStaticAgentConfigSchema.encode({
            slackChatBotMessageId: slackChatBotMessage.id,
            slackThreadTs: mainMessage.message?.thread_ts,
            messageTs: mainMessage.message?.ts,
            botId: mainMessage.message?.bot_id,
          });
          await slackClient.chat.postEphemeral({
            channel: slackChannelId,
            user: slackUserId,
            text: "You can use another agent by using the dropdown in slack.",
            blocks: makeAssistantSelectionBlock(
              agentConfigurations,
              JSON.stringify(blockId)
            ),
            thread_ts: slackMessageTs,
          });
        }

        return new Ok(undefined);
      }

      default:
        assertNever(event);
    }
  }

  return new Err(
    new SlackAnswerRetryableError("Failed to get the final answer from Dust")
  );
}

async function postSlackMessageUpdate(
  {
    messageUpdate,
    slack,
    connector,
    conversation,
    mainMessage,
  }: {
    messageUpdate: SlackMessageUpdate;
    slack: {
      slackChannelId: string;
      slackClient: WebClient;
      slackMessageTs: string;
      slackUserInfo: SlackUserInfo;
      slackUserId: string | null;
    };
    connector: ConnectorResource;
    conversation: ConversationPublicType;
    mainMessage: ChatPostMessageResponse;
  },
  { adhereToRateLimit }: { adhereToRateLimit: boolean } = {
    adhereToRateLimit: true,
  }
) {
  let lastSentDate = new Date();
  let backoffTime = initialBackoffTime;

  const { slackChannelId, slackClient } = slack;
  const conversationUrl = makeConversationUrl(
    connector.workspaceId,
    conversation.sId
  );

  if (
    lastSentDate.getTime() + backoffTime > new Date().getTime() &&
    adhereToRateLimit
  ) {
    return;
  }

  lastSentDate = new Date();
  if (adhereToRateLimit) {
    // Linear increase of backoff time.
    backoffTime = Math.min(backoffTime + initialBackoffTime, maxBackoffTime);
  }

  const response = await slackClient.chat.update({
    ...makeMessageUpdateBlocksAndText(
      conversationUrl,
      connector.workspaceId,
      messageUpdate
    ),
    channel: slackChannelId,
    ts: mainMessage.ts as string,
  });

  if (response.error) {
    logger.error(
      {
        connectorId: connector.id,
        conversationId: conversation.sId,
        err: response.error,
      },
      "Failed to update Slack message."
    );
  }
}

/**
 * Safely prepare the answer by normalizing the content for Slack and converting it to Markdown.
 * In streaming mode, partial links might trigger errors in the `slackifyMarkdown` function.
 * This function handles such errors gracefully, ensuring that the full text will be displayed
 * once a valid URL is available.
 */
function safelyPrepareAnswer(text: string): string | null {
  const rawAnswer = normalizeContentForSlack(text);

  try {
    return slackifyMarkdown(rawAnswer);
  } catch (err) {
    // It's safe to swallow the error as we'll catch up once a valid URL is fully received.
    return null;
  }
}

function normalizeContentForSlack(content: string): string {
  // Remove language hint from code blocks.
  return content.replace(/```[a-z\-_]*\n/g, "```\n");
}
// Parses a structured output to determine the message and reaction name.
// The output is a JSON object with the following structure:
// { "message": "...", "slackReaction": { "add": true, "emoji": ":wave:" } }
// or { "message": "...", "reaction": { "add": true, "reaction": "wave" } }
function parseStructuredOutput(content: string): {
  cleanedText: string;
  reactionName: string | null;
} {
  try {
    try {
      const parsed = JSON.parse(content.trim());

      // If it's a valid JSON object with our expected structure
      if (typeof parsed === "object" && parsed !== null) {
        let messageText = "";
        let reactionName: string | null = null;

        // Extract message text
        if (parsed.message && typeof parsed.message === "string") {
          messageText = parsed.message;
        }

        // Extract reaction info
        const reactionData = parsed.slackReaction || parsed.reaction;
        if (reactionData?.add === true) {
          const emoji = reactionData.emoji || reactionData.reaction;
          if (emoji && typeof emoji === "string") {
            reactionName = emoji;
          }
        }

        return { cleanedText: messageText || content, reactionName };
      }
    } catch (directParseError) {
      // Not a direct JSON, continue with regex approach
    }

    return { cleanedText: content, reactionName: null };
  } catch (error) {
    return { cleanedText: content, reactionName: null };
  }
}

/**
 * Splits long content into multiple messages that fit within Slack's length limit.
 * Attempts to split at natural boundaries (paragraphs, sentences) when possible.
 */
function splitContentForSlack(
  content: string,
  maxLength: number = MAX_SLACK_MESSAGE_LENGTH
): string[] {
  if (content.length <= maxLength) {
    return [content];
  }

  const messages: string[] = [];
  let remaining = content;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      messages.push(remaining);
      break;
    }

    // Try to find a good split point (paragraph, sentence, or space)
    let splitPoint = maxLength;

    // Look for paragraph breaks first
    const paragraphBreak = remaining.lastIndexOf("\n\n", maxLength);
    if (paragraphBreak > maxLength * 0.7) {
      splitPoint = paragraphBreak + 2;
    } else {
      // Look for sentence breaks
      const sentenceBreak = remaining.lastIndexOf(". ", maxLength);
      if (sentenceBreak > maxLength * 0.7) {
        splitPoint = sentenceBreak + 2;
      } else {
        // Look for any space
        const spaceBreak = remaining.lastIndexOf(" ", maxLength);
        if (spaceBreak > maxLength * 0.5) {
          splitPoint = spaceBreak + 1;
        }
      }
    }

    messages.push(remaining.substring(0, splitPoint).trim());
    remaining = remaining.substring(splitPoint).trim();
  }

  return messages;
}
