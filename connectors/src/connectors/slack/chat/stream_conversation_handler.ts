// biome-ignore lint/suspicious/noImportCycles: ignored using `--suppress`
import type { SlackMessageUpdate } from "@connectors/connectors/slack/chat/blocks";
import {
  MAX_SLACK_MESSAGE_LENGTH,
  makeAssistantSelectionBlock,
  makeMessageUpdateBlocksAndText,
  makeToolAuthenticationBlock,
  makeToolValidationBlock,
  // biome-ignore lint/suspicious/noImportCycles: ignored using `--suppress`
} from "@connectors/connectors/slack/chat/blocks";
import { isSlackWebAPIPlatformError } from "@connectors/connectors/slack/lib/errors";
import type { SlackUserInfo } from "@connectors/connectors/slack/lib/slack_client";
import { RATE_LIMITS } from "@connectors/connectors/slack/ratelimits";
import { apiConfig } from "@connectors/lib/api/config";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { annotateCitations } from "@connectors/lib/bot/citations";
import { makeConversationUrl } from "@connectors/lib/bot/conversation_utils";
import type { SlackChatBotMessageModel } from "@connectors/lib/models/slack";
import { createProxyAwareFetch } from "@connectors/lib/proxy";
import { throttleWithRedis } from "@connectors/lib/throttle";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import { redisClient } from "@connectors/types/shared/redis_client";
import type {
  AgentActionPublicType,
  ConversationPublicType,
  LightAgentConfigurationType,
  Result,
  UserMessageType,
} from "@dust-tt/client";
import {
  assertNever,
  DustAPI,
  Err,
  Ok,
  removeNulls,
  TOOL_RUNNING_LABEL,
} from "@dust-tt/client";
import type { ChatPostMessageResponse, WebClient } from "@slack/web-api";
import * as t from "io-ts";
import slackifyMarkdown from "slackify-markdown";

function getActionRunningLabel(action: AgentActionPublicType): string {
  return action.displayLabels?.running ?? TOOL_RUNNING_LABEL;
}

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

export function getAuthResponseUrlRedisKey(
  workspaceId: string,
  messageId: string
) {
  return `slack:auth:response_url:${workspaceId}:${messageId}`;
}

/**
 * Deletes the auth ephemeral via response_url (stored in Redis by the webhook
 * handler when the user clicks "Authenticate") and posts a success message.
 * Ephemerals can only be modified via response_url, not chat.delete.
 */
async function cleanupAuthEphemeral(
  pendingAuthEphemeral: { redisKey: string; serverName: string },
  slackClient: WebClient,
  slackChannelId: string,
  slackUserId: string,
  slackMessageTs: string
): Promise<void> {
  const redis = await redisClient({ origin: "slack_auth" });
  const responseUrl = await redis.get(pendingAuthEphemeral.redisKey);
  if (!responseUrl) {
    return;
  }
  const proxyFetch = createProxyAwareFetch();
  await proxyFetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delete_original: true }),
  });
  await redis.del(pendingAuthEphemeral.redisKey);
  await slackClient.chat.postEphemeral({
    channel: slackChannelId,
    user: slackUserId,
    text: `Authentication for \`${pendingAuthEphemeral.serverName}\` successful ✅`,
    thread_ts: slackMessageTs,
  });
}

interface StreamConversationToSlackParams {
  assistantName: string;
  connector: ConnectorResource;
  conversation: ConversationPublicType;
  mainMessage: ChatPostMessageResponse;
  slack: {
    slackChannelId: string;
    slackClient: WebClient;
    slackMessageTs: string;
    slackTeamId: string;
    slackUserInfo: SlackUserInfo;
    slackUserId: string | null;
  };
  userMessage: UserMessageType;
  slackChatBotMessage: SlackChatBotMessageModel;
  agentConfigurations: LightAgentConfigurationType[];
  feedbackVisibleToAuthorOnly: boolean;
}

export async function streamConversationToSlack(
  dustAPI: DustAPI,
  conversationData: StreamConversationToSlackParams
): Promise<Result<undefined, Error>> {
  const { assistantName, agentConfigurations } = conversationData;

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

class SlackAnswerRetryableError extends Error {}

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
    feedbackVisibleToAuthorOnly,
  } = conversationData;

  const {
    slackChannelId,
    slackClient,
    slackMessageTs,
    slackTeamId,
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
  let pendingPersonalAuth: {
    redisKey: string;
    serverName: string;
  } | null = null;

  const streamer = slackClient.chatStream({
    channel: slackChannelId,
    thread_ts: slackMessageTs,
    recipient_team_id: slackTeamId,
    recipient_user_id: slackUserId ?? undefined,
    buffer_size: 256,
  });
  let streamStarted = false;

  for await (const event of streamRes.value.eventStream) {
    switch (event.type) {
      case "tool_params":
      case "tool_notification": {
        await postSlackMessageUpdate({
          messageUpdate: {
            isThinking: true,
            assistantName,
            agentConfigurations,
            text: answer,
            thinkingAction: getActionRunningLabel(event.action),
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

      case "tool_personal_auth_required": {
        const conversationUrl = makeConversationUrl(
          connector.workspaceId,
          conversation.sId
        );

        if (slackUserId && !slackUserInfo.is_bot && conversationUrl) {
          await slackClient.chat.postEphemeral({
            channel: slackChannelId,
            user: slackUserId,
            text: "Personal authentication required",
            blocks: makeToolAuthenticationBlock({
              agentName: event.metadata.agentName,
              serverName: event.metadata.mcpServerDisplayName,
              conversationUrl,
              value: JSON.stringify({
                workspaceId: connector.workspaceId,
                messageId: event.messageId,
              }),
            }),
            thread_ts: slackMessageTs,
          });

          pendingPersonalAuth = {
            redisKey: getAuthResponseUrlRedisKey(
              connector.workspaceId,
              event.messageId
            ),
            serverName: event.metadata.mcpServerDisplayName,
          };
        }

        await postSlackMessageUpdate({
          messageUpdate: {
            text: "Agent is waiting for authentication…",
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
        // tool_personal_auth_required is always followed by a tool_error;
        // ignore it so the stream stays open while the user authenticates.
        if (pendingPersonalAuth) {
          break;
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
        if (pendingPersonalAuth && slackUserId && !slackUserInfo.is_bot) {
          await cleanupAuthEphemeral(
            pendingPersonalAuth,
            slackClient,
            slackChannelId,
            slackUserId,
            slackMessageTs
          );
          pendingPersonalAuth = null;
        }
        actions.push(event.action);
        break;
      }

      case "generation_tokens": {
        if (event.classification !== "tokens") {
          continue;
        }

        answer += event.text;

        await streamer.append({ markdown_text: event.text });
        streamStarted = true;
        break;
      }

      case "agent_message_success": {
        const finalAnswer = event.message.content ?? "";
        const messageActions = event.message.actions;
        const messageId = event.message.sId;
        const { formattedContent, footnotes } = annotateCitations(
          finalAnswer,
          messageActions
        );

        const authResult = await slackClient.auth.test();
        let filesUploaded: { file: Buffer; filename: string }[] = [];
        if (
          authResult.ok &&
          authResult.response_metadata?.scopes?.includes("files:write")
        ) {
          const files = messageActions.flatMap(
            (action) => action.generatedFiles
          );
          filesUploaded = await getFilesFromDust(files, dustAPI);
        }

        const slackContent = slackifyMarkdown(
          normalizeContentForSlack(formattedContent)
        );

        const messageUpdate: SlackMessageUpdate = {
          text: slackContent,
          assistantName,
          agentConfigurations,
          footnotes,
          conversationId: conversation.sId,
          messageId,
        };

        if (streamStarted) {
          await finalizeStreamMessage({
            streamer,
            messageUpdate,
            slack,
            connector,
            conversation,
            mainMessage,
            filesUploaded,
          });
        } else {
          // Fallback: no tokens were streamed, use existing chat.update path.
          const shouldSplitMessage =
            slackContent.length > MAX_SLACK_MESSAGE_LENGTH
              ? await getMessageSplittingFromFeatureFlag(
                  conversationData.connector
                )
              : false;

          if (shouldSplitMessage) {
            const splitMessages = splitContentForSlack(slackContent);

            if (filesUploaded.length > 0) {
              await deleteAndRepostMessageWithFiles({
                messageUpdate: {
                  ...messageUpdate,
                  text: splitMessages[0],
                },
                ...conversationData,
                uploadedFiles: filesUploaded,
              });
            } else {
              await postSlackMessageUpdate({
                messageUpdate: {
                  ...messageUpdate,
                  text: splitMessages[0],
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

            if (splitMessages.length > 1) {
              await postThreadFollowUpMessages(
                splitMessages.slice(1),
                conversationData
              );
            }
          } else {
            if (filesUploaded.length > 0) {
              await deleteAndRepostMessageWithFiles({
                messageUpdate,
                ...conversationData,
                uploadedFiles: filesUploaded,
              });
            } else {
              await postSlackMessageUpdate({
                messageUpdate,
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
        }

        // Post feedback buttons and agent selection.
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

          const selectionBlocks = makeAssistantSelectionBlock(
            agentConfigurations,
            JSON.stringify(blockId),
            feedbackParams
          );

          if (feedbackVisibleToAuthorOnly) {
            await slackClient.chat.postEphemeral({
              channel: slackChannelId,
              user: slackUserId,
              text: "Feedback and agent selection",
              blocks: selectionBlocks,
              thread_ts: slackMessageTs,
            });
          } else {
            await slackClient.chat.postMessage({
              channel: slackChannelId,
              text: "Feedback and agent selection",
              blocks: selectionBlocks,
              thread_ts: slackMessageTs,
            });
          }
        }

        return new Ok(undefined);
      }

      case "agent_generation_cancelled": {
        const cancelledMessage = "_Message generation was cancelled._";
        const { formattedContent, footnotes } = annotateCitations(
          answer || cancelledMessage,
          actions
        );
        const slackContent = slackifyMarkdown(
          normalizeContentForSlack(formattedContent)
        );

        if (streamStarted) {
          await streamer.stop();
          await slackClient.chat.delete({
            channel: slackChannelId,
            ts: mainMessage.ts as string,
          });
        } else {
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
        }

        return new Ok(undefined);
      }

      case "agent_message_done":
        // No-op, we handle completion in "agent_message_success"
        break;

      default:
        assertNever(event);
    }
  }

  // Clean up stream on early termination.
  if (streamStarted) {
    try {
      await streamer.stop();
    } catch (_err) {
      // Stream might already be stopped.
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
    { canBeIgnored },
    async () => {
      try {
        return await slackClient.chat.update({
          ...makeMessageUpdateBlocksAndText(
            conversationUrl,
            connector.workspaceId,
            messageUpdate
          ),
          channel: slackChannelId,
          ts: mainMessage.ts as string,
          // Note: file_ids is not supported by chat.update API, so we need to delete and repost the message
        });
      } catch (error) {
        if (
          isSlackWebAPIPlatformError(error) &&
          error.data.error === "message_not_found"
        ) {
          return undefined;
        }
        throw error;
      }
    },
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
 * Stops the Slack stream, deletes the placeholder, and posts the final formatted message.
 * If the stream or formatting fails, falls back to chat.postMessage.
 */
async function finalizeStreamMessage({
  streamer,
  messageUpdate,
  slack,
  connector,
  conversation,
  mainMessage,
  filesUploaded,
}: {
  streamer: ReturnType<WebClient["chatStream"]>;
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
  filesUploaded: { file: Buffer; filename: string }[];
}): Promise<void> {
  const { slackChannelId, slackClient, slackMessageTs } = slack;
  const conversationUrl = makeConversationUrl(
    connector.workspaceId,
    conversation.sId
  );

  try {
    const stopRes = await streamer.stop();
    const streamTs = stopRes.ts;

    await slackClient.chat.delete({
      channel: slackChannelId,
      ts: mainMessage.ts as string,
    });

    if (filesUploaded.length > 0) {
      // Files require a new message — delete stream message and repost with files.
      await slackClient.filesUploadV2({
        ...makeMessageUpdateBlocksAndText(
          conversationUrl,
          connector.workspaceId,
          messageUpdate
        ),
        channel_id: slackChannelId,
        file_uploads: filesUploaded,
        thread_ts: slackMessageTs,
      });
      await slackClient.chat.delete({
        channel: slackChannelId,
        ts: streamTs as string,
      });
    } else if (
      messageUpdate.text &&
      messageUpdate.text.length <= MAX_SLACK_MESSAGE_LENGTH
    ) {
      // Update the stream message with properly formatted content (citations, blocks, footer).
      // For long messages, the stream message stands as-is since the full content
      // was already delivered via streaming.
      await slackClient.chat.update({
        ...makeMessageUpdateBlocksAndText(
          conversationUrl,
          connector.workspaceId,
          messageUpdate
        ),
        channel: slackChannelId,
        ts: streamTs as string,
      });
    }
  } catch (err) {
    // Stream finalization failed — fall back to posting the full message.
    logger.error(
      { err, connectorId: connector.id },
      "Failed to finalize stream, falling back to postMessage"
    );
    await slackClient.chat.postMessage({
      ...makeMessageUpdateBlocksAndText(
        conversationUrl,
        connector.workspaceId,
        messageUpdate
      ),
      channel: slackChannelId,
      thread_ts: slackMessageTs,
    });
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
    }
  } catch {
    // Fall through to warn + default.
  }

  logger.warn(
    {
      connectorId: connector.id,
      workspaceId: connector.workspaceId,
    },
    "Failed to fetch feature flags, defaulting to message truncation"
  );
  return false;
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
  const visibleFiles = files.filter((file) => !file.hidden);
  const uploadResults = await concurrentExecutor(
    visibleFiles,
    async (file) => {
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
    },
    { concurrency: 10 }
  );

  return removeNulls(uploadResults);
}
