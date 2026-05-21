import {
  AWAITING_TOOL_APPROVAL_LABEL,
  getActionDoneLabel,
  getActionRunningLabel,
  getRunAgentNotificationOutput,
} from "@connectors/connectors/slack/chat/action_utils";
import {
  MAX_SLACK_MESSAGE_LENGTH,
  makeAssistantSelectionBlock,
  makeMarkdownBlock,
  makeMessageUpdateBlocksAndText,
  makeToolAuthenticationBlock,
  makeToolFileAuthorizationBlock,
  makeToolValidationBlock,
  makeUserQuestionBlock,
  type SlackMessageUpdate,
  // biome-ignore lint/suspicious/noImportCycles: ignored using `--suppress`
} from "@connectors/connectors/slack/chat/blocks";
// biome-ignore lint/suspicious/noImportCycles: ignored using `--suppress`
import { PlanMessageHandler } from "@connectors/connectors/slack/chat/plan_message_handler";
import type { SlackStreamHandler } from "@connectors/connectors/slack/chat/slack_stream_handler";
import { isSlackWebAPIPlatformError } from "@connectors/connectors/slack/lib/errors";
import { formatAgentMarkdownForSlack } from "@connectors/connectors/slack/lib/format_agent_markdown_for_slack";
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
  AgentEvent,
  ConversationPublicType,
  LightAgentConfigurationType,
  Result,
  UserMessageType,
} from "@dust-tt/client";
import { assertNever, DustAPI, Err, Ok, removeNulls } from "@dust-tt/client";
import type { WebClient } from "@slack/web-api";
import * as t from "io-ts";

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

export const SlackUserQuestionActionValueSchema = t.type({
  workspaceId: t.string,
  conversationId: t.string,
  messageId: t.string,
  actionId: t.string,
  slackChatBotMessageId: t.number,
});

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
  streamHandler: SlackStreamHandler;
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

async function runBestEffortSlackCleanup({
  planHandler,
  streamHandler,
  logContext,
}: {
  planHandler: PlanMessageHandler;
  streamHandler: SlackStreamHandler;
  logContext: Record<string, unknown>;
}): Promise<void> {
  planHandler.abortAllChildStreams();

  try {
    await planHandler.deletePlanMessage();
  } catch (error) {
    logger.warn(
      { error, ...logContext },
      "Failed to delete Slack plan message while cleaning up Slack stream."
    );
  }

  try {
    await streamHandler.stop();
  } catch (error) {
    logger.warn(
      { error, ...logContext },
      "Failed to stop Slack stream while cleaning up Slack stream."
    );
  }
}

export async function streamConversationToSlack(
  dustAPI: DustAPI,
  conversationData: StreamConversationToSlackParams
): Promise<Result<undefined, Error>> {
  const {
    assistantName,
    agentConfigurations,
    streamHandler,
    connector,
    conversation,
  } = conversationData;
  const { slackChannelId, slackClient, slackMessageTs } =
    conversationData.slack;

  if (!streamHandler) {
    // Old path: update placeholder with thinking state.
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
  }

  const conversationUrl = makeConversationUrl(
    connector.workspaceId,
    conversation.sId
  );

  const planHandler = new PlanMessageHandler({
    dustAPI,
    slackClient,
    slackChannelId,
    slackMessageTs,
    conversationUrl,
    assistantName,
    workspaceId: connector.workspaceId,
  });

  try {
    return await streamAgentAnswerToSlack(
      dustAPI,
      conversationData,
      planHandler
    );
  } finally {
    // Cleanup streams and plan message on unexpected error
    await runBestEffortSlackCleanup({
      planHandler,
      streamHandler,
      logContext: {
        connectorId: connector.id,
        conversationId: conversation.sId,
      },
    });
  }
}

class SlackAnswerRetryableError extends Error {
  constructor(message: string) {
    super(message);
  }
}

type SlackUserActionType = Extract<
  AgentEvent["type"],
  | "tool_approve_execution"
  | "tool_file_auth_required"
  | "tool_personal_auth_required"
  | "tool_ask_user_question"
>;

export const SLACK_USER_ACTION_IDLE_TIMEOUT_MS = 4 * 60 * 1000 + 30 * 1000; // 4.5 minutes

function getUserActionLabel(actionType: SlackUserActionType): string {
  switch (actionType) {
    case "tool_approve_execution":
      return "tool execution approval";
    case "tool_file_auth_required":
      return "file access authorization";
    case "tool_personal_auth_required":
      return "tool authentication";
    case "tool_ask_user_question":
      return "response to a question";
    default:
      assertNever(actionType);
  }
}

function getContinueOnDustSuffix(conversationUrl: string | null): string {
  return conversationUrl ? ` <${conversationUrl}|Continue on Dust>.` : "";
}

function getUserActionFallbackMessage(
  actionType: SlackUserActionType,
  conversationUrl: string | null
): string {
  return `:hourglass_flowing_sand: _Streaming was interrupted after 5 mins waiting on a ${getUserActionLabel(actionType)}.${getContinueOnDustSuffix(conversationUrl)}_`;
}

async function streamAgentAnswerToSlack(
  dustAPI: DustAPI,
  conversationData: StreamConversationToSlackParams,
  planHandler: PlanMessageHandler
) {
  const {
    assistantName,
    conversation,
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
    slackUserInfo,
    slackUserId,
  } = slack;

  const abortController = new AbortController();

  const streamRes = await dustAPI.streamAgentAnswerEvents({
    conversation,
    userMessageId: userMessage.sId,
    signal: abortController.signal,
  });

  if (streamRes.isErr()) {
    return new Err(new Error(streamRes.error.message));
  }

  const { eventStream } = streamRes.value;

  let answer = "";
  // Partial :cite[...] marker that may span across tokens.
  let pendingCitePrefix = "";
  const actions: AgentActionPublicType[] = [];
  let pendingPersonalAuth: {
    redisKey: string;
    serverName: string;
  } | null = null;
  let pendingUserActionType: SlackUserActionType | null = null;
  let timedOutUserActionType: SlackUserActionType | null = null;
  let userActionTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const { streamHandler } = conversationData;

  const slackAgentMarkdownOptions = {
    agentMentionLinkContext: {
      workspaceId: connector.workspaceId,
      conversationId: conversation.sId,
    },
  };

  const clearUserActionTimeout = () => {
    if (userActionTimeoutHandle) {
      clearTimeout(userActionTimeoutHandle);
      userActionTimeoutHandle = null;
    }

    if (!pendingUserActionType) {
      return;
    }

    logger.info(
      {
        connectorId: connector.id,
        conversationId: conversation.sId,
        pendingActionType: pendingUserActionType,
      },
      "Clearing user-action idle timeout for Slack stream."
    );

    pendingUserActionType = null;
  };

  const startUserActionTimeout = (actionType: SlackUserActionType) => {
    clearUserActionTimeout();

    pendingUserActionType = actionType;
    timedOutUserActionType = null;
    userActionTimeoutHandle = setTimeout(() => {
      timedOutUserActionType = pendingUserActionType;

      logger.info(
        {
          connectorId: connector.id,
          conversationId: conversation.sId,
          pendingActionType: pendingUserActionType,
        },
        "Slack stream idle timeout: user action not taken, aborting SSE stream."
      );

      abortController.abort();
    }, SLACK_USER_ACTION_IDLE_TIMEOUT_MS);
    userActionTimeoutHandle.unref?.();

    logger.info(
      {
        connectorId: connector.id,
        conversationId: conversation.sId,
        pendingActionType: actionType,
      },
      "Starting user-action idle timeout for Slack stream."
    );
  };

  const postUserActionEphemeral = async <T extends { text: string }>(
    payload: T
  ): Promise<void> => {
    if (!slackUserId || slackUserInfo.is_bot) {
      return;
    }

    await slackClient.chat.postEphemeral({
      ...payload,
      channel: slackChannelId,
      thread_ts: slackMessageTs,
      user: slackUserId,
    });
  };

  async function* eventStreamWithTimeoutCleanup() {
    try {
      yield* eventStream;
    } finally {
      clearUserActionTimeout();
    }
  }

  for await (const event of eventStreamWithTimeoutCleanup()) {
    switch (event.type) {
      case "tool_params":
      case "tool_notification": {
        clearUserActionTimeout();

        const isRunAgent = event.action.internalMCPServerName === "run_agent";

        // For run_agent, skip tool_params and early notifications:
        // the child stream handles progress.
        if (isRunAgent && event.type === "tool_notification") {
          const output = getRunAgentNotificationOutput(event);
          if (output) {
            await planHandler.startChildStream(output);
          }
          break;
        }

        // For all other tools, rotate a single default task card.
        const thinkingAction = getActionRunningLabel(event.action);

        planHandler.setDefaultTask(thinkingAction, "in_progress", event.action);
        await planHandler.upsertPlanMessage(thinkingAction);
        break;
      }

      case "tool_approve_execution": {
        startUserActionTimeout(event.type);

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
          slackThreadTs: slackMessageTs,
          messageTs: streamHandler.messageTs,
          botId: undefined,
          slackChatBotMessageId: slackChatBotMessage.id,
        });

        planHandler.setTaskAwaitingToolApproval();
        await planHandler.upsertPlanMessage(AWAITING_TOOL_APPROVAL_LABEL);
        await streamHandler.setThinking(AWAITING_TOOL_APPROVAL_LABEL);

        await postUserActionEphemeral({
          text: "Approve tool execution",
          blocks: makeToolValidationBlock({
            agentName: event.metadata.agentName,
            toolName: event.metadata.toolName,
            id: JSON.stringify(blockId),
          }),
        });
        break;
      }

      case "tool_personal_auth_required": {
        startUserActionTimeout(event.type);

        const conversationUrl = makeConversationUrl(
          connector.workspaceId,
          conversation.sId
        );

        if (slackUserId && !slackUserInfo.is_bot && conversationUrl) {
          await postUserActionEphemeral({
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
          });

          pendingPersonalAuth = {
            redisKey: getAuthResponseUrlRedisKey(
              connector.workspaceId,
              event.messageId
            ),
            serverName: event.metadata.mcpServerDisplayName,
          };
        }

        planHandler.setDefaultTask("Waiting for authentication…", "pending");
        await planHandler.upsertPlanMessage("Waiting for authentication…");
        break;
      }

      case "tool_file_auth_required": {
        startUserActionTimeout(event.type);

        const conversationUrl = makeConversationUrl(
          connector.workspaceId,
          conversation.sId
        );

        if (slackUserId && !slackUserInfo.is_bot && conversationUrl) {
          await postUserActionEphemeral({
            text: "File authorization required",
            blocks: makeToolFileAuthorizationBlock({
              agentName: event.metadata.agentName,
              fileName: event.fileAuthError.fileName,
              conversationUrl,
              value: JSON.stringify({
                workspaceId: connector.workspaceId,
                messageId: event.messageId,
              }),
            }),
          });
        }

        await streamHandler.setThinking("Waiting for file authorization...");
        break;
      }

      case "user_message_error": {
        clearUserActionTimeout();

        return new Err(
          new Error(
            `User message error: code: ${event.error.code} message: ${event.error.message}`
          )
        );
      }

      case "tool_error": {
        clearUserActionTimeout();

        return new Err(
          new Error(
            `Tool message error: code: ${event.error.code} message: ${event.error.message}`
          )
        );
      }
      case "agent_error": {
        clearUserActionTimeout();

        planHandler.abortAllChildStreams();
        await planHandler.deletePlanMessage();
        return new Err(
          new Error(
            `Agent message error: code: ${event.error.code} message: ${event.error.message}`
          )
        );
      }

      case "agent_action_success": {
        clearUserActionTimeout();

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

        // Mark default task complete (for non-run_agent tools).
        if (event.action.internalMCPServerName !== "run_agent") {
          const doneLabel = getActionDoneLabel(event.action);
          planHandler.setDefaultTask(doneLabel, "complete", event.action);
          await planHandler.upsertPlanMessage(doneLabel);
        }

        actions.push(event.action);
        break;
      }

      case "generation_tokens": {
        clearUserActionTimeout();

        if (event.classification !== "tokens") {
          continue;
        }

        answer += event.text;

        if (streamHandler.isStopped) {
          break;
        }
        if (answer.length <= MAX_SLACK_MESSAGE_LENGTH) {
          const combined = pendingCitePrefix + event.text;
          pendingCitePrefix = "";

          // Strip complete :cite[...] markers (resolved to footnotes on final chat.update).
          let safeText = combined.replace(/ ?:cite\[[a-zA-Z0-9, ]+\]/g, "");

          // Hold back trailing partial markers until the next token.
          const partialMatch = safeText.match(
            / ?:c(?:i(?:t(?:e(?:\[[a-zA-Z0-9, ]*)?)?)?)?$/
          );
          if (partialMatch) {
            pendingCitePrefix = partialMatch[0];
            safeText = safeText.slice(0, -pendingCitePrefix.length);
          }

          if (safeText) {
            await streamHandler.appendText(safeText);
          }
          break;
        }

        // Message too long for streaming: stop and fall back to chat.update.
        await streamHandler.stop();
        await planHandler.deletePlanMessage();
        const { formattedContent, footnotes } = annotateCitations(
          // Do not log unsupported directives: `answer` may still be mid-generation
          // when we stop only because the Slack length cap was hit.
          formatAgentMarkdownForSlack(answer, slackAgentMarkdownOptions),
          actions
        );

        await postSlackMessageUpdate({
          messageUpdate: {
            text: formattedContent,
            assistantName,
            agentConfigurations,
            footnotes,
          },
          ...conversationData,
          canBeIgnored: false,
          extraLogs: {
            source: "streamAgentAnswerToSlack",
            eventType: "stream_fallback",
          },
        });
        break;
      }

      case "agent_message_gracefully_stopped":
      case "agent_message_success": {
        clearUserActionTimeout();

        // Flush pending text that turned out not to be a citation.
        if (pendingCitePrefix) {
          await streamHandler.appendText(pendingCitePrefix);
          pendingCitePrefix = "";
        }

        planHandler.abortAllChildStreams();
        await planHandler.deletePlanMessage();

        const finalAnswer = event.message.content ?? "";
        const actions = event.message.actions;
        const messageId = event.message.sId; // Get the message ID
        const { formattedContent, footnotes } = annotateCitations(
          formatAgentMarkdownForSlack(finalAnswer, {
            ...slackAgentMarkdownOptions,
            // Terminal agent payload from the API — safe to detect unknown directives.
            logUnsupportedDirectives: true,
          }),
          actions
        );

        const authResult = await slackClient.auth.test();
        let filesUploaded: { file: Buffer; filename: string }[] = [];
        if (
          authResult.ok &&
          authResult.response_metadata?.scopes?.includes("files:write")
        ) {
          const files = actions.flatMap((action) => action.generatedFiles);
          filesUploaded = await getFilesFromDust(files, dustAPI);
        }

        await streamHandler.stop();

        {
          const messageUpdate: SlackMessageUpdate = {
            text: formattedContent,
            assistantName,
            agentConfigurations,
            footnotes,
            conversationId: conversation.sId,
            messageId,
          };

          const shouldSplitMessage =
            formattedContent.length > MAX_SLACK_MESSAGE_LENGTH
              ? await getMessageSplittingFromFeatureFlag(
                  conversationData.connector
                )
              : false;

          if (shouldSplitMessage) {
            const splitMessages = splitContentForSlack(formattedContent);

            if (filesUploaded.length > 0) {
              await deleteAndRepostMessageWithFiles({
                messageUpdate: { ...messageUpdate, text: splitMessages[0] },
                ...conversationData,
                uploadedFiles: filesUploaded,
              });
            } else {
              await postSlackMessageUpdate({
                messageUpdate: { ...messageUpdate, text: splitMessages[0] },
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
          } else if (filesUploaded.length > 0) {
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

        // Post feedback buttons and agent selection (ephemeral or regular message based on setting)
        if (
          slackUserId &&
          !slackUserInfo.is_bot &&
          (agentConfigurations.length > 0 || (conversation.sId && messageId))
        ) {
          const blockId = SlackBlockIdStaticAgentConfigSchema.encode({
            slackChatBotMessageId: slackChatBotMessage.id,
            slackThreadTs: slackMessageTs,
            messageTs: streamHandler.messageTs,
            botId: undefined,
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
        clearUserActionTimeout();

        planHandler.abortAllChildStreams();
        await planHandler.deletePlanMessage();
        await streamHandler.stop();

        const cancelledMessage = "_Message generation was cancelled._";
        const {
          formattedContent: cancelledContent,
          footnotes: cancelledFootnotes,
        } = annotateCitations(
          // Do not log: `answer` is streaming buffer and may end mid-directive on cancel.
          formatAgentMarkdownForSlack(
            answer || cancelledMessage,
            slackAgentMarkdownOptions
          ),
          actions
        );

        await postSlackMessageUpdate({
          messageUpdate: {
            text: cancelledContent,
            assistantName,
            agentConfigurations,
            footnotes: cancelledFootnotes,
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

      case "tool_ask_user_question": {
        startUserActionTimeout(event.type);

        const questionValue = JSON.stringify({
          workspaceId: connector.workspaceId,
          conversationId: event.conversationId,
          messageId: event.messageId,
          actionId: event.actionId,
          slackChatBotMessageId: slackChatBotMessage.id,
        });

        await postUserActionEphemeral({
          text: event.question.question,
          blocks: makeUserQuestionBlock({
            question: event.question,
            value: questionValue,
          }),
        });
        break;
      }

      case "agent_context_pruned":
      case "agent_message_done":
      case "tool_call_started":
        clearUserActionTimeout();

        // No-op.
        break;

      default:
        assertNever(event);
    }
  }

  if (abortController.signal.aborted && timedOutUserActionType) {
    planHandler.abortAllChildStreams();
    await planHandler.deletePlanMessage();
    await streamHandler.stop();

    const conversationUrl = makeConversationUrl(
      connector.workspaceId,
      conversation.sId
    );
    const fallbackText = getUserActionFallbackMessage(
      timedOutUserActionType,
      conversationUrl
    );

    await slackClient.chat.postMessage({
      channel: slackChannelId,
      text: fallbackText,
      blocks: makeMarkdownBlock(fallbackText),
      thread_ts: slackMessageTs,
      unfurl_links: false,
    });

    logger.info(
      {
        connectorId: connector.id,
        conversationId: conversation.sId,
        pendingActionType: timedOutUserActionType,
      },
      "Posted user-action timeout fallback message to Slack."
    );

    return new Ok(undefined);
  }

  // Clean up if the event stream ended without a terminal event.
  planHandler.abortAllChildStreams();
  await planHandler.deletePlanMessage();
  await streamHandler.stop();

  return new Err(
    new SlackAnswerRetryableError("Failed to get the final answer from Dust")
  );
}

async function deleteAndRepostMessageWithFiles({
  messageUpdate,
  slack,
  connector,
  conversation,
  streamHandler,
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
  streamHandler: SlackStreamHandler;
  uploadedFiles: { file: Buffer; filename: string }[];
}): Promise<void> {
  const { slackChannelId, slackClient, slackMessageTs } = slack;
  const conversationUrl = makeConversationUrl(
    connector.workspaceId,
    conversation.sId
  );

  const deleteTs = streamHandler.messageTs;

  // First post a new message with files
  const response = await slackClient.filesUploadV2({
    ...makeMessageUpdateBlocksAndText(
      conversationUrl,
      connector.workspaceId,
      messageUpdate,
      { isUpload: true }
    ),
    channel_id: slackChannelId,
    file_uploads: uploadedFiles,
    thread_ts: slackMessageTs,
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
  if (deleteTs) {
    try {
      await slackClient.chat.delete({
        channel: slackChannelId,
        ts: deleteTs,
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
}

async function postSlackMessageUpdate({
  messageUpdate,
  slack,
  connector,
  conversation,
  streamHandler,
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
  streamHandler: SlackStreamHandler;
  canBeIgnored: boolean;
  extraLogs: Record<string, string>;
}): Promise<void> {
  const targetTs = streamHandler.messageTs;
  if (!targetTs) {
    return;
  }

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
          ts: targetTs,
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
  const { slack, connector, conversation } = conversationData;
  const { slackChannelId, slackClient, slackMessageTs } = slack;

  for (let i = 0; i < followUpMessages.length; i++) {
    const threadResponse = await slackClient.chat.postMessage({
      channel: slackChannelId,
      blocks: makeMarkdownBlock(followUpMessages[i] || ""),
      thread_ts: slackMessageTs,
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
  const visibleFiles = files.filter((file) => !file.hidden); // Skip hidden files
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
