import type {
  AgentActionPublicType,
  ConversationPublicType,
  LightAgentConfigurationType,
  Result,
  UserMessageType,
} from "@dust-tt/client";
import { DustAPI } from "@dust-tt/client";
import {
  assertNever,
  Err,
  isMCPServerPersonalAuthRequiredError,
  Ok,
  TOOL_RUNNING_LABEL,
} from "@dust-tt/client";
import type { ChatPostMessageResponse, WebClient } from "@slack/web-api";
import * as t from "io-ts";
import { throttle } from "lodash";
import slackifyMarkdown from "slackify-markdown";

import type { SlackMessageUpdate } from "@connectors/connectors/slack/chat/blocks";
import {
  makeAssistantSelectionBlock,
  makeMessageUpdateBlocksAndText,
  makeToolValidationBlock,
  MAX_SLACK_MESSAGE_LENGTH,
} from "@connectors/connectors/slack/chat/blocks";
import { makeConversationUrl } from "@connectors/connectors/slack/chat/utils";
import type { SlackUserInfo } from "@connectors/connectors/slack/lib/slack_client";
import { RATE_LIMITS } from "@connectors/connectors/slack/ratelimits";
import { apiConfig } from "@connectors/lib/api/config";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { annotateCitations } from "@connectors/lib/bot/citations";
import type { SlackChatBotMessage } from "@connectors/lib/models/slack";
import { throttleWithRedis } from "@connectors/lib/throttle";
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
}

export async function streamConversationToSlack(
  dustAPI: DustAPI,
  conversationData: StreamConversationToSlackParams
): Promise<Result<undefined, Error>> {
  const { assistantName, agentConfigurations } = conversationData;

  // Immediately post the conversation URL once available.
  await postSlackMessageUpdate({
    messageUpdate: {
      isThinking: true,
      assistantName,
      agentConfigurations,
    },
    ...conversationData,
    canBeIgnored: false,
    extraLogs: { source: "streamConversationToSlack" },
  });

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
  const throttledPostSlackMessageUpdate = throttle(postSlackMessageUpdate, 500);
  for await (const event of streamRes.value.eventStream) {
    switch (event.type) {
      case "tool_params":
      case "tool_notification": {
        await throttledPostSlackMessageUpdate({
          messageUpdate: {
            isThinking: true,
            assistantName,
            agentConfigurations,
            text: answer,
            thinkingAction: TOOL_RUNNING_LABEL,
          },
          ...conversationData,
          canBeIgnored: true,
          extraLogs: {
            source: "streamAgentAnswerToSlack",
            eventType: event.type,
          },
        });

        break;
      }

      case "tool_approve_execution": {
        logger.info(
          {
            connectorId: connector.id,
            conversationId: conversation.sId,
            eventConversationId: event.conversationId,
            messageId: event.messageId,
            actionId: event.actionId,
            toolName: event.metadata.toolName,
            agentName: event.metadata.agentName,
          },
          "Tool validation request"
        );

        const blockId = SlackBlockIdToolValidationSchema.encode({
          workspaceId: connector.workspaceId,
          conversationId: event.conversationId,
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
          await throttledPostSlackMessageUpdate({
            messageUpdate: {
              text:
                "The agent took an action that requires personal authentication. " +
                `Please go to <${conversationUrl}|the conversation> to authenticate.`,
              assistantName,
              agentConfigurations,
            },
            ...conversationData,
            canBeIgnored: false,
            extraLogs: {
              source: "streamAgentAnswerToSlack",
              eventType: event.type,
            },
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
        // If the message is too long, we avoid the update entirely (to reduce
        // rate limiting) the previous update will have shown the "..." and the
        // link to continue the conversation so this is fine.
        if (slackContent.length > MAX_SLACK_MESSAGE_LENGTH) {
          break;
        }
        await throttledPostSlackMessageUpdate({
          messageUpdate: {
            text: slackContent,
            assistantName,
            agentConfigurations,
            footnotes,
          },
          ...conversationData,
          canBeIgnored: true,
          extraLogs: {
            source: "streamAgentAnswerToSlack",
            eventType: event.type,
          },
        });
        break;
      }

      case "agent_message_success": {
        const finalAnswer = event.message.content ?? "";
        const actions = event.message.actions;
        const messageId = event.message.sId; // Get the message ID
        const { formattedContent, footnotes } = annotateCitations(
          finalAnswer,
          actions
        );
        const files = actions.flatMap((action) => action.generatedFiles);
        const filesUploaded = await getFilesFromDust(files, dustAPI);

        const slackContent = slackifyMarkdown(
          normalizeContentForSlack(formattedContent)
        );

        const shouldSplitMessage =
          slackContent.length > MAX_SLACK_MESSAGE_LENGTH
            ? await getMessageSplittingFromFeatureFlag(
                conversationData.connector
              )
            : false;

        if (shouldSplitMessage) {
          const splitMessages = splitContentForSlack(slackContent);

          throttledPostSlackMessageUpdate.cancel();

          // If we have files, we need to delete and repost the message
          if (filesUploaded.length > 0) {
            await deleteAndRepostMessageWithFiles({
              messageUpdate: {
                text: splitMessages[0],
                assistantName,
                agentConfigurations,
                footnotes,
                conversationId: conversation.sId,
                messageId,
              },
              ...conversationData,
              uploadedFiles: filesUploaded,
            });
          } else {
            await postSlackMessageUpdate({
              messageUpdate: {
                text: splitMessages[0],
                assistantName,
                agentConfigurations,
                footnotes,
                conversationId: conversation.sId,
                messageId,
              },
              ...conversationData,
              canBeIgnored: false,
              extraLogs: {
                source: "streamAgentAnswerToSlack",
                eventType: event.type,
                shouldSplitMessage: "true",
              },
            });
          }

          // Post additional messages as thread replies
          if (splitMessages.length > 1) {
            await postThreadFollowUpMessages(
              splitMessages.slice(1),
              conversationData
            );
          }
        } else {
          // If we have files, we need to delete and repost the message
          if (filesUploaded.length > 0) {
            await deleteAndRepostMessageWithFiles({
              messageUpdate: {
                text: slackContent,
                assistantName,
                agentConfigurations,
                footnotes,
                conversationId: conversation.sId,
                messageId,
              },
              ...conversationData,
              uploadedFiles: filesUploaded,
            });
          } else {
            // Use normal single message update (with truncation if needed)
            await postSlackMessageUpdate({
              messageUpdate: {
                text: slackContent,
                assistantName,
                agentConfigurations,
                footnotes,
                conversationId: conversation.sId,
                messageId,
              },
              ...conversationData,
              canBeIgnored: false,
              extraLogs: {
                source: "streamAgentAnswerToSlack",
                eventType: event.type,
                shouldSplitMessage: "false",
              },
            });
          }
        }
        // Post ephemeral message with feedback buttons and agent selection
        if (
          slackUserId &&
          !slackUserInfo.is_bot &&
          (agentConfigurations.length > 0 || (conversation.sId && messageId))
        ) {
          const blockId = SlackBlockIdStaticAgentConfigSchema.encode({
            slackChatBotMessageId: slackChatBotMessage.id,
            slackThreadTs: mainMessage.message?.thread_ts,
            messageTs: mainMessage.message?.ts,
            botId: mainMessage.message?.bot_id,
          });

          const feedbackParams =
            conversation.sId && messageId
              ? {
                  conversationId: conversation.sId,
                  messageId,
                  workspaceId: connector.workspaceId,
                }
              : undefined;

          const ephemeralBlocks = makeAssistantSelectionBlock(
            agentConfigurations,
            JSON.stringify(blockId),
            feedbackParams
          );

          await slackClient.chat.postEphemeral({
            channel: slackChannelId,
            user: slackUserId,
            text: "Feedback and agent selection",
            blocks: ephemeralBlocks,
            thread_ts: slackMessageTs,
          });
        }

        return new Ok(undefined);
      }

      case "agent_generation_cancelled": {
        // Handle generation cancellation by showing a cancelled message
        const cancelledMessage = "_Message generation was cancelled._";
        const { formattedContent, footnotes } = annotateCitations(
          answer || cancelledMessage,
          actions
        );
        const slackContent = slackifyMarkdown(
          normalizeContentForSlack(formattedContent)
        );

        await postSlackMessageUpdate({
          messageUpdate: {
            text: slackContent,
            assistantName,
            agentConfigurations,
            footnotes,
          },
          ...conversationData,
          canBeIgnored: false,
          extraLogs: {
            source: "streamAgentAnswerToSlack",
            eventType: event.type,
          },
        });

        return new Ok(undefined);
      }

      case "agent_message_done":
        // No-op, we handle completion in "agent_message_success"
        break;

      default:
        assertNever(event);
    }
  }

  return new Err(
    new SlackAnswerRetryableError("Failed to get the final answer from Dust")
  );
}

async function deleteAndRepostMessageWithFiles({
  messageUpdate,
  slack,
  connector,
  conversation,
  mainMessage,
  uploadedFiles,
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
  uploadedFiles: { file: Buffer; filename: string }[];
}): Promise<void> {
  const { slackChannelId, slackClient } = slack;
  const conversationUrl = makeConversationUrl(
    connector.workspaceId,
    conversation.sId
  );

  // First post a new message with files
  const response = await slackClient.filesUploadV2({
    ...makeMessageUpdateBlocksAndText(
      conversationUrl,
      connector.workspaceId,
      messageUpdate
    ),
    channel_id: slackChannelId,
    file_uploads: uploadedFiles,
    thread_ts: mainMessage.message?.thread_ts, // Preserve thread context if it exists
  });

  if (response?.error) {
    logger.error(
      {
        provider: "slack",
        connectorId: connector.id,
        conversationId: conversation.sId,
        err: response.error,
      },
      "Failed to repost Slack message with files."
    );
  }

  // Then, delete the original message
  try {
    await slackClient.chat.delete({
      channel: slackChannelId,
      ts: mainMessage.ts as string,
    });
  } catch (error) {
    logger.error(
      {
        provider: "slack",
        connectorId: connector.id,
        conversationId: conversation.sId,
        err: error,
      },
      "Failed to delete original Slack message."
    );
  }
}

async function postSlackMessageUpdate({
  messageUpdate,
  slack,
  connector,
  conversation,
  mainMessage,
  canBeIgnored,
  extraLogs,
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
  canBeIgnored: boolean;
  extraLogs: Record<string, string>;
}): Promise<void> {
  const { slackChannelId, slackClient } = slack;
  const conversationUrl = makeConversationUrl(
    connector.workspaceId,
    conversation.sId
  );

  const response = await throttleWithRedis(
    RATE_LIMITS["chat.update"],
    `${connector.id}-chat-update`,
    canBeIgnored,
    async () =>
      slackClient.chat.update({
        ...makeMessageUpdateBlocksAndText(
          conversationUrl,
          connector.workspaceId,
          messageUpdate
        ),
        channel: slackChannelId,
        ts: mainMessage.ts as string,
        // Note: file_ids is not supported by chat.update API, so we need to delete and repost the message
      }),
    extraLogs
  );

  if (!canBeIgnored && response?.error) {
    logger.error(
      {
        provider: "slack",
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

/**
 * Posts follow-up messages as thread replies, respecting rate limits.
 * This function handles the additional messages after the main message has been updated.
 */
async function postThreadFollowUpMessages(
  followUpMessages: string[],
  conversationData: StreamConversationToSlackParams
): Promise<void> {
  const { slack, connector, conversation, mainMessage } = conversationData;
  const { slackChannelId, slackClient } = slack;

  for (let i = 0; i < followUpMessages.length; i++) {
    const threadResponse = await slackClient.chat.postMessage({
      channel: slackChannelId,
      text: followUpMessages[i] || "",
      thread_ts: mainMessage.ts,
    });

    if (threadResponse.error) {
      logger.error(
        {
          connectorId: connector.id,
          conversationId: conversation.sId,
          err: threadResponse.error,
          messageIndex: i,
        },
        "Failed to post thread follow-up message."
      );
    }
  }
}

async function getMessageSplittingFromFeatureFlag(
  connector: ConnectorResource
): Promise<boolean> {
  try {
    const dataSourceConfig = dataSourceConfigFromConnector(connector);
    const dustAPI = new DustAPI(
      {
        url: apiConfig.getDustFrontAPIUrl(),
      },
      {
        apiKey: dataSourceConfig.workspaceAPIKey,
        workspaceId: dataSourceConfig.workspaceId,
      },
      logger
    );

    const featureFlagsRes = await dustAPI.getWorkspaceFeatureFlags();
    if (featureFlagsRes.isOk()) {
      return featureFlagsRes.value.includes("slack_message_splitting");
    } else {
      logger.warn(
        {
          error: featureFlagsRes.error,
          connectorId: connector.id,
          workspaceId: connector.workspaceId,
        },
        "Failed to fetch feature flags, defaulting to message truncation"
      );
      return false;
    }
  } catch (error) {
    logger.warn(
      {
        error,
        connectorId: connector.id,
        workspaceId: connector.workspaceId,
      },
      "Failed to fetch feature flags, defaulting to message truncation"
    );
    return false;
  }
}

async function getFilesFromDust(
  files: Array<{
    fileId: string;
    title: string;
    contentType: string;
    snippet: string | null;
    hidden?: boolean;
  }>,
  dustAPI: DustAPI
): Promise<{ file: Buffer; filename: string }[]> {
  const uploadPromises = files
    .filter((file) => !file.hidden) // Skip hidden files
    .map(async (file) => {
      try {
        const fileBuffer = await dustAPI.downloadFile({ fileID: file.fileId });
        if (!fileBuffer || fileBuffer.isErr()) {
          return null;
        }
        return {
          file: fileBuffer.value,
          filename: file.title,
        };
      } catch (error) {
        logger.error(
          {
            fileId: file.fileId,
            title: file.title,
            error: error instanceof Error ? error.message : String(error),
          },
          "Error downloading file from Dust"
        );
        return null;
      }
    });

  const uploadResults = await Promise.all(uploadPromises);
  return uploadResults.filter((result) => result !== null) as {
    file: Buffer;
    filename: string;
  }[];
}
