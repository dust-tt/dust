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
  makeMessageUpdateBlocksAndText,
  makeToolValidationBlock,
  MAX_SLACK_MESSAGE_LENGTH,
} from "@connectors/connectors/slack/chat/blocks";
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
}

interface SlackUpdateState {
  updateCount: number;
  lastUpdateTime: number;
}

/**
 * Determines if a Slack update should be skipped based on exponential backoff.
 *
 * This is a best-effort attempt to limit the number of API calls to Slack to avoid hitting their
 * rate limits while still providing a fluid experience at the beginning of the conversation.
 *
 * The strategy uses exponential backoff:
 * - First 3 updates: no delay (instant feedback)
 * - Updates 4-6: 500ms minimum spacing
 * - Updates 7-10: 2s minimum spacing
 * - Updates 11-15: 4s minimum spacing
 * - Updates 16-20: 8s minimum spacing
 * - Updates 21+: 10s minimum spacing
 *
 * This results in ~20-21 updates max per minute, well below Slack's rate limits (50/min).
 *
 * @param updateCount - Number of updates sent so far in this conversation
 * @param lastUpdateTime - Timestamp of the last update (ms since epoch)
 * @returns true if the update should be skipped, false otherwise
 */
function shouldSkipSlackUpdate({
  updateCount,
  lastUpdateTime,
}: SlackUpdateState): boolean {
  const timeSinceLastUpdate = Date.now() - lastUpdateTime;

  // Determine minimum spacing based on update count (exponential backoff).
  let minSpacing = 0;
  if (updateCount >= 21) {
    minSpacing = 10_000; // 10s.
  } else if (updateCount >= 16) {
    minSpacing = 8_000; // 8s.
  } else if (updateCount >= 11) {
    minSpacing = 4_000; // 4s.
  } else if (updateCount >= 7) {
    minSpacing = 2_000; // 2s.
  } else if (updateCount >= 4) {
    minSpacing = 500; // 500ms.
  }
  // Updates 1-3: no delay (minSpacing = 0).

  return timeSinceLastUpdate < minSpacing;
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

  // Track update count and timing for exponential backoff.
  let updateState: SlackUpdateState = {
    updateCount: 0,
    lastUpdateTime: Date.now(),
  };

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
      case "tool_notification": {
        updateState = await postSlackMessageUpdate(
          {
            messageUpdate: {
              isThinking: true,
              assistantName,
              agentConfigurations,
              text: answer,
              thinkingAction: TOOL_RUNNING_LABEL,
            },
            ...conversationData,
            updateState,
          },
          { adhereToRateLimit: false }
        );

        break;
      }

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
          updateState = await postSlackMessageUpdate({
            messageUpdate: {
              text:
                "The agent took an action that requires personal authentication. " +
                `Please go to <${conversationUrl}|the conversation> to authenticate.`,
              assistantName,
              agentConfigurations,
            },
            ...conversationData,
            updateState,
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
        updateState = await postSlackMessageUpdate({
          messageUpdate: {
            text: slackContent,
            assistantName,
            agentConfigurations,
            footnotes,
          },
          ...conversationData,
          updateState,
        });
        break;
      }

      case "agent_message_success": {
        const finalAnswer = event.message.content ?? "";
        const actions = event.message.actions;
        const { formattedContent, footnotes } = annotateCitations(
          finalAnswer,
          actions
        );
        const slackContent = slackifyMarkdown(
          normalizeContentForSlack(formattedContent)
        );

        updateState = await postSlackMessageUpdate(
          {
            messageUpdate: {
              text: slackContent,
              assistantName,
              agentConfigurations,
              footnotes,
            },
            ...conversationData,
            updateState,
          },
          { adhereToRateLimit: false }
        );
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
    updateState,
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
    updateState?: SlackUpdateState;
  },
  { adhereToRateLimit }: { adhereToRateLimit: boolean } = {
    adhereToRateLimit: true,
  }
): Promise<{ updateCount: number; lastUpdateTime: number }> {
  const { slackChannelId, slackClient } = slack;
  const conversationUrl = makeConversationUrl(
    connector.workspaceId,
    conversation.sId
  );

  // Use provided state or initialize
  let { updateCount = 0, lastUpdateTime = Date.now() } = updateState || {};

  if (adhereToRateLimit) {
    const shouldSkip = shouldSkipSlackUpdate({ updateCount, lastUpdateTime });

    if (shouldSkip) {
      logger.info(
        {
          connectorId: connector.id,
          conversationId: conversation.sId,
          updateCount,
          skippedDueToBackoff: true,
        },
        "Skipping Slack update due to rate limiting"
      );
      return { updateCount, lastUpdateTime };
    }
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

  // Always update state when we make an API call (regardless of success or adhereToRateLimit).
  // This ensures we track all updates for accurate rate limiting.
  updateCount++;
  lastUpdateTime = Date.now();

  return { updateCount, lastUpdateTime };
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
