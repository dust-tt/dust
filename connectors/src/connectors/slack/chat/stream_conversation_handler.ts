import type {
  AgentActionPublicType,
  ConversationPublicType,
  DustAPI,
  LightAgentConfigurationType,
  Result,
  UserMessageType,
} from "@dust-tt/client";
import { assertNever, Err, Ok, TOOL_RUNNING_LABEL } from "@dust-tt/client";
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

// Adding linear backoff mechanism.
const maxBackoffTime = 10_000; // Maximum backoff time.
const initialBackoffTime = 1_000;

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
      case "tool_error":
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
        await postSlackMessageUpdate({
          messageUpdate: {
            text: slackContent,
            assistantName,
            agentConfigurations,
            footnotes,
          },
          ...conversationData,
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
