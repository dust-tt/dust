import type {
  AgentActionPublicType,
  ConversationPublicType,
  DustAPI,
  UserMessageType,
} from "@dust-tt/client";
import type { LightAgentConfigurationType, Result } from "@dust-tt/client";
import { ACTION_RUNNING_LABELS, assertNever, Err, Ok } from "@dust-tt/client";
import type { ChatPostMessageResponse, WebClient } from "@slack/web-api";
import slackifyMarkdown from "slackify-markdown";

import type { SlackMessageUpdate } from "@connectors/connectors/slack/chat/blocks";
import {
  makeAssistantSelectionBlock,
  makeMessageUpdateBlocksAndText,
  MAX_SLACK_MESSAGE_LENGTH,
} from "@connectors/connectors/slack/chat/blocks";
import { annotateCitations } from "@connectors/connectors/slack/chat/citations";
import { makeConversationUrl } from "@connectors/connectors/slack/chat/utils";
import type { SlackUserInfo } from "@connectors/connectors/slack/lib/slack_client";
import type { SlackChatBotMessage } from "@connectors/lib/models/slack";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

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
  {
    assistantName,
    connector,
    conversation,
    mainMessage,
    slack,
    userMessage,
    slackChatBotMessage,
    agentConfigurations,
  }: StreamConversationToSlackParams
): Promise<Result<undefined, Error>> {
  const {
    slackChannelId,
    slackClient,
    slackMessageTs,
    slackUserInfo,
    slackUserId,
  } = slack;

  let lastSentDate = new Date();
  let backoffTime = initialBackoffTime;

  const postSlackMessageUpdate = async (
    messageUpdate: SlackMessageUpdate,
    { adhereToRateLimit }: { adhereToRateLimit: boolean } = {
      adhereToRateLimit: true,
    }
  ) => {
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
      thread_ts: slackMessageTs,
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
  };

  const conversationUrl = makeConversationUrl(
    connector.workspaceId,
    conversation.sId
  );

  // Immediately post the conversation URL once available.
  await postSlackMessageUpdate(
    { isComplete: false, isThinking: true, assistantName, agentConfigurations },
    { adhereToRateLimit: false }
  );

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
      case "browse_params":
      case "conversation_include_file_params":
      case "dust_app_run_block":
      case "dust_app_run_params":
      case "process_params":
      case "reasoning_started":
      case "reasoning_thinking":
      case "reasoning_tokens":
      case "retrieval_params":
      case "search_labels_params":
      case "tables_query_model_output":
      case "tables_query_output":
      case "tables_query_started":
      case "websearch_params":
        await postSlackMessageUpdate(
          {
            isComplete: false,
            isThinking: true,
            assistantName,
            agentConfigurations,
            text: answer,
            thinkingAction: ACTION_RUNNING_LABELS[event.action.type],
          },
          { adhereToRateLimit: false }
        );

        break;

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
      case "error": {
        return new Err(
          new Error(
            `Error: code: ${event.content.code} message: ${event.content.message}`
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
          isComplete: false,
          text: slackContent,
          assistantName,
          agentConfigurations,
          footnotes,
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
            isComplete: true,
            text: slackContent,
            assistantName,
            agentConfigurations,
            footnotes,
          },
          { adhereToRateLimit: false }
        );
        if (
          slackUserId &&
          !slackUserInfo.is_bot &&
          agentConfigurations.length > 0
        ) {
          await slackClient.chat.postEphemeral({
            channel: slackChannelId,
            user: slackUserId,
            text: "You can use another agent by using the dropdown in slack.",
            blocks: makeAssistantSelectionBlock(
              agentConfigurations,
              JSON.stringify({
                slackChatBotMessage: slackChatBotMessage.id,
                slackThreadTs: mainMessage.message?.thread_ts,
                messageTs: mainMessage.message?.ts,
                botId: mainMessage.message?.bot_id,
              })
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

  return new Err(new Error("Failed to get the final answer from Dust"));
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
