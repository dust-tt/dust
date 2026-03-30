import {
  MAX_SLACK_MESSAGE_LENGTH,
  makeAssistantSelectionBlock,
  makeMessageUpdateBlocksAndText,
  makePlanMessage,
  makeToolAuthenticationBlock,
  makeToolValidationBlock,
  type SlackMessageUpdate,
  type TaskCardSource,
  type TaskCardState,
  // biome-ignore lint/suspicious/noImportCycles: ignored using `--suppress`
} from "@connectors/connectors/slack/chat/blocks";
import type { SlackStreamHandler } from "@connectors/connectors/slack/chat/slack_stream_handler";
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
  AgentEvent,
  ConversationPublicType,
  LightAgentConfigurationType,
  NotificationRunAgentContent,
  Result,
  ToolNotificationEvent,
  UserMessageType,
} from "@dust-tt/client";
import {
  assertNever,
  DustAPI,
  Err,
  NotificationRunAgentContentSchema,
  Ok,
  removeNulls,
  TOOL_RUNNING_LABEL,
} from "@dust-tt/client";
import type { ChatPostMessageResponse, WebClient } from "@slack/web-api";
import * as t from "io-ts";
import throttle from "lodash/throttle";
import slackifyMarkdown from "slackify-markdown";
import { z } from "zod";

const SLACK_MESSAGE_UPDATE_THROTTLE_MS = 1_000;
const SLACK_MESSAGE_UPDATE_SLOW_THROTTLE_MS = 5_000;
const SLACK_MESSAGE_LONG_THRESHOLD_CHARS = 400;

// run_agent actions have null displayLabels due to a gap in the server-side
// tool type system (ServerSideMCPToolType doesn't carry displayLabels).
// Fall back to the label defined in the run_agent server metadata.
const RUN_AGENT_RUNNING_LABEL = "Running agent";

function getActionRunningLabel(action: AgentActionPublicType): string {
  if (action.displayLabels?.running) {
    return action.displayLabels.running;
  }
  if (action.internalMCPServerName === "run_agent") {
    return RUN_AGENT_RUNNING_LABEL;
  }
  return TOOL_RUNNING_LABEL;
}

function getActionDoneLabel(action: AgentActionPublicType): string {
  return action.displayLabels?.done ?? "Done";
}

const SearchParamsSchema = z.object({ query: z.string() });
const BrowseParamsSchema = z.object({ urls: z.array(z.string().url()) });
const SourceResourceSchema = z.object({
  uri: z.string().url(),
  title: z.string(),
});

function getActionDetails(action: AgentActionPublicType): string | undefined {
  const search = SearchParamsSchema.safeParse(action.params);
  if (search.success) {
    return search.data.query;
  }
  const browse = BrowseParamsSchema.safeParse(action.params);
  if (browse.success) {
    return browse.data.urls.map((url) => new URL(url).hostname).join(", ");
  }
  return undefined;
}

function getActionSources(
  action: AgentActionPublicType
): TaskCardSource[] | undefined {
  if (!action.output) {
    return undefined;
  }
  const sources: TaskCardSource[] = [];
  for (const block of action.output) {
    if (block.type === "resource" && "resource" in block) {
      const result = SourceResourceSchema.safeParse(block.resource);
      if (result.success) {
        sources.push({ url: result.data.uri, text: result.data.title });
      }
    }
  }
  return sources.length > 0 ? sources : undefined;
}

function getRunAgentNotificationOutput(
  event: ToolNotificationEvent
): NotificationRunAgentContent | null {
  if (event.action.internalMCPServerName !== "run_agent") {
    return null;
  }
  const result = NotificationRunAgentContentSchema.safeParse(
    event.notification._meta.data.output
  );
  if (!result.success || !result.data.agentMessageId) {
    return null;
  }
  return result.data;
}

const getThrottleDelay = (textLength: number): number => {
  if (textLength >= SLACK_MESSAGE_LONG_THRESHOLD_CHARS) {
    return SLACK_MESSAGE_UPDATE_SLOW_THROTTLE_MS;
  }
  return SLACK_MESSAGE_UPDATE_THROTTLE_MS;
};

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
  mainMessage?: ChatPostMessageResponse;
  streamHandler?: SlackStreamHandler;
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
  const { assistantName, agentConfigurations, streamHandler } =
    conversationData;

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
    feedbackVisibleToAuthorOnly,
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
  let pendingPersonalAuth: {
    redisKey: string;
    serverName: string;
  } | null = null;

  const { streamHandler } = conversationData;

  const conversationUrl = makeConversationUrl(
    connector.workspaceId,
    conversation.sId
  );

  // -- Plan message: standalone message with plan block + task cards --
  // Only used when native streaming (streamHandler) is enabled.
  // Deleted on terminal events.

  const taskCards = new Map<string, TaskCardState>();
  let planMessageTs: string | undefined;

  async function upsertPlanMessage(title: string) {
    const payload = makePlanMessage({
      planTitle: title,
      tasks: [...taskCards.values()],
      conversationUrl,
      assistantName,
      workspaceId: connector.workspaceId,
    });

    if (planMessageTs) {
      await slackClient.chat.update({
        ...payload,
        channel: slackChannelId,
        ts: planMessageTs,
      });
    } else {
      const res = await slackClient.chat.postMessage({
        ...payload,
        channel: slackChannelId,
        thread_ts: slackMessageTs,
      });
      planMessageTs = res.ts;
    }
  }

  async function deletePlanMessage() {
    if (!planMessageTs) {
      return;
    }
    const ts = planMessageTs;
    planMessageTs = undefined;
    await slackClient.chat.delete({ channel: slackChannelId, ts });
  }

  // -- Child stream tracking for run_agent actions --
  // Only used when native streaming (streamHandler) is enabled.

  const childStreamControllers = new Map<string, AbortController>();

  async function handleChildStreamEvent(
    taskId: string,
    event: AgentEvent
  ): Promise<"continue" | "complete" | "error"> {
    switch (event.type) {
      case "tool_params":
      case "tool_notification": {
        const label = getActionRunningLabel(event.action);
        taskCards.set(taskId, {
          taskId,
          title: label,
          status: "in_progress",
          details: getActionDetails(event.action),
        });
        await upsertPlanMessage(label);
        return "continue";
      }
      case "agent_action_success": {
        const label = getActionDoneLabel(event.action);
        taskCards.set(taskId, {
          taskId,
          title: label,
          status: "complete",
          details: getActionDetails(event.action),
          sources: getActionSources(event.action),
        });
        await upsertPlanMessage(label);
        return "continue";
      }
      case "agent_message_success":
      case "agent_generation_cancelled":
        return "complete";
      case "agent_error":
        return "error";
      default:
        return "continue";
    }
  }

  async function startChildStream(output: NotificationRunAgentContent) {
    if (!streamHandler || !output.agentMessageId) {
      return false;
    }

    const controller = new AbortController();
    const { conversationId, agentMessageId } = output;
    childStreamControllers.set(conversationId, controller);

    // One task card per child agent, keyed by conversationId.
    const taskId = conversationId;

    // Consume child stream in background.
    void (async () => {
      const streamRes = await dustAPI.streamAgentMessageEvents({
        conversation: { sId: conversationId },
        agentMessage: { sId: agentMessageId },
        signal: controller.signal,
        options: {
          maxReconnectAttempts: 10,
          reconnectDelay: 5_000,
          autoReconnect: true,
        },
      });
      if (streamRes.isErr()) {
        logger.error(
          { conversationId, error: streamRes.error },
          "Failed to open child agent stream"
        );
        return;
      }
      try {
        for await (const event of streamRes.value.eventStream) {
          const result = await handleChildStreamEvent(taskId, event);
          if (result === "complete" || result === "error") {
            break;
          }
        }
      } catch {
        // AbortError or stream failure — handled by cleanup.
      } finally {
        childStreamControllers.delete(conversationId);
      }
    })();

    return true;
  }

  function abortAllChildStreams() {
    for (const [, controller] of childStreamControllers) {
      controller.abort();
    }
    childStreamControllers.clear();
  }

  let currentThrottleDelay = SLACK_MESSAGE_UPDATE_THROTTLE_MS;
  let throttledPostSlackMessageUpdate = throttle(
    postSlackMessageUpdate,
    currentThrottleDelay
  );

  for await (const event of streamRes.value.eventStream) {
    switch (event.type) {
      case "tool_params":
      case "tool_notification": {
        const isRunAgent = event.action.internalMCPServerName === "run_agent";

        // For run_agent, skip tool_params and early notifications:
        // the child stream handles progress.
        if (isRunAgent && event.type === "tool_notification") {
          const output = getRunAgentNotificationOutput(event);
          if (output) {
            await startChildStream(output);
          }
          break;
        }

        // For all other tools, rotate a single default task card.
        const thinkingAction = getActionRunningLabel(event.action);

        if (streamHandler) {
          taskCards.set("default", {
            taskId: "default",
            title: thinkingAction,
            status: "in_progress",
            details: getActionDetails(event.action),
          });
          await upsertPlanMessage(thinkingAction);
        } else {
          await throttledPostSlackMessageUpdate({
            messageUpdate: {
              isThinking: true,
              assistantName,
              agentConfigurations,
              text: answer,
              thinkingAction,
            },
            ...conversationData,
            canBeIgnored: true,
            extraLogs: {
              source: "streamAgentAnswerToSlack",
              eventType: event.type,
            },
          });
        }
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
          slackThreadTs: streamHandler
            ? slackMessageTs
            : mainMessage?.message?.thread_ts,
          messageTs: streamHandler?.messageTs ?? mainMessage?.message?.ts,
          botId: streamHandler ? undefined : mainMessage?.message?.bot_id,
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

        if (streamHandler) {
          taskCards.set("default", {
            taskId: "default",
            title: "Waiting for authentication…",
            status: "pending",
          });
          await upsertPlanMessage("Waiting for authentication…");
        } else {
          await throttledPostSlackMessageUpdate({
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
        abortAllChildStreams();
        await deletePlanMessage();
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

        // Mark default task complete (for non-run_agent tools).
        if (
          streamHandler &&
          event.action.internalMCPServerName !== "run_agent"
        ) {
          const doneLabel = getActionDoneLabel(event.action);
          taskCards.set("default", {
            taskId: "default",
            title: doneLabel,
            status: "complete",
            details: getActionDetails(event.action),
            sources: getActionSources(event.action),
          });
          await upsertPlanMessage(doneLabel);
        }

        actions.push(event.action);
        break;
      }

      case "generation_tokens": {
        if (event.classification !== "tokens") {
          continue;
        }

        answer += event.text;

        // Streaming path: append text or stop if too long.
        if (streamHandler?.isStopped) {
          break;
        }
        if (streamHandler && answer.length <= MAX_SLACK_MESSAGE_LENGTH) {
          await streamHandler.appendText(event.text);
          break;
        }
        if (streamHandler) {
          // Message too long for streaming: stop and fall back to chat.update
          // with truncated content + footer.
          await streamHandler.stop();
          await deletePlanMessage();
          const { formattedContent, footnotes } = annotateCitations(
            answer,
            actions
          );
          const slackContent = safelyPrepareAnswer(formattedContent);
          // If the answer cannot be prepared safely, skip processing these tokens.
          if (slackContent) {
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
                eventType: "stream_fallback",
              },
            });
          }
          break;
        }

        // Non-streaming path: throttled chat.update.
        {
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

          const newThrottleDelay = getThrottleDelay(slackContent.length);
          if (newThrottleDelay !== currentThrottleDelay) {
            currentThrottleDelay = newThrottleDelay;
            throttledPostSlackMessageUpdate.cancel();
            throttledPostSlackMessageUpdate = throttle(
              postSlackMessageUpdate,
              currentThrottleDelay
            );
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
        }
        break;
      }

      case "agent_message_success": {
        abortAllChildStreams();
        await deletePlanMessage();

        const finalAnswer = event.message.content ?? "";
        const actions = event.message.actions;
        const messageId = event.message.sId; // Get the message ID
        const { formattedContent, footnotes } = annotateCitations(
          finalAnswer,
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

        const slackContent = slackifyMarkdown(
          normalizeContentForSlack(formattedContent)
        );

        if (streamHandler && !streamHandler.isStopped) {
          await streamHandler.stop();
        }

        {
          const messageUpdate: SlackMessageUpdate = {
            text: slackContent,
            assistantName,
            agentConfigurations,
            footnotes,
            conversationId: conversation.sId,
            messageId,
          };

          const shouldSplitMessage =
            slackContent.length > MAX_SLACK_MESSAGE_LENGTH
              ? await getMessageSplittingFromFeatureFlag(
                  conversationData.connector
                )
              : false;

          if (shouldSplitMessage) {
            const splitMessages = splitContentForSlack(slackContent);

            throttledPostSlackMessageUpdate.cancel();

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
            slackThreadTs: streamHandler
              ? slackMessageTs
              : mainMessage?.message?.thread_ts,
            messageTs: streamHandler?.messageTs ?? mainMessage?.message?.ts,
            botId: streamHandler ? undefined : mainMessage?.message?.bot_id,
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
        abortAllChildStreams();
        await deletePlanMessage();
        if (streamHandler && !streamHandler.isStopped) {
          await streamHandler.stop();
        }

        const cancelledMessage = "_Message generation was cancelled._";
        const {
          formattedContent: cancelledContent,
          footnotes: cancelledFootnotes,
        } = annotateCitations(answer || cancelledMessage, actions);
        const cancelledSlackContent = slackifyMarkdown(
          normalizeContentForSlack(cancelledContent)
        );

        await postSlackMessageUpdate({
          messageUpdate: {
            text: cancelledSlackContent,
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

      case "agent_context_pruned":
      case "agent_message_done":
        // No-op.
        break;

      default:
        assertNever(event);
    }
  }

  // Clean up if the event stream ended without a terminal event.
  abortAllChildStreams();
  await deletePlanMessage();
  if (streamHandler && !streamHandler.isStopped) {
    await streamHandler.stop();
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
  mainMessage?: ChatPostMessageResponse;
  streamHandler?: SlackStreamHandler;
  uploadedFiles: { file: Buffer; filename: string }[];
}): Promise<void> {
  const { slackChannelId, slackClient, slackMessageTs } = slack;
  const conversationUrl = makeConversationUrl(
    connector.workspaceId,
    conversation.sId
  );

  const threadTs = mainMessage?.message?.thread_ts ?? slackMessageTs;
  const deleteTs = streamHandler?.messageTs ?? mainMessage?.ts;

  // First post a new message with files
  const response = await slackClient.filesUploadV2({
    ...makeMessageUpdateBlocksAndText(
      conversationUrl,
      connector.workspaceId,
      messageUpdate
    ),
    channel_id: slackChannelId,
    file_uploads: uploadedFiles,
    thread_ts: threadTs, // Preserve thread context if it exists
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
  mainMessage,
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
  mainMessage?: ChatPostMessageResponse;
  streamHandler?: SlackStreamHandler;
  canBeIgnored: boolean;
  extraLogs: Record<string, string>;
}): Promise<void> {
  const targetTs = streamHandler?.messageTs ?? mainMessage?.ts;
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
 * Safely prepare the answer by normalizing the content for Slack and converting it to Markdown.
 * In streaming mode, partial links might trigger errors in the `slackifyMarkdown` function.
 * This function handles such errors gracefully, ensuring that the full text will be displayed
 * once a valid URL is available.
 */
function safelyPrepareAnswer(text: string): string | null {
  const rawAnswer = normalizeContentForSlack(text);

  try {
    return slackifyMarkdown(rawAnswer);
  } catch (_err) {
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
  const { slack, connector, conversation, mainMessage, streamHandler } =
    conversationData;
  const { slackChannelId, slackClient } = slack;
  const threadTs = mainMessage?.ts ?? streamHandler?.messageTs;

  for (let i = 0; i < followUpMessages.length; i++) {
    const threadResponse = await slackClient.chat.postMessage({
      channel: slackChannelId,
      text: followUpMessages[i] || "",
      thread_ts: threadTs,
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
