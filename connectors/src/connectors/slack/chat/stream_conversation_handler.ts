import type {
  AgentActionType,
  AgentMessageType,
  ConversationType,
  DustAPI,
  Result,
  UserMessageType,
} from "@dust-tt/types";
import { assertNever, Err, Ok } from "@dust-tt/types";
import type { ChatPostMessageResponse, WebClient } from "@slack/web-api";
import slackifyMarkdown from "slackify-markdown";

import type { SlackMessageUpdate } from "@connectors/connectors/slack/chat/blocks";
import {
  makeMessageUpdateBlocksAndText,
  MAX_SLACK_MESSAGE_LENGTH,
} from "@connectors/connectors/slack/chat/blocks";
import { annotateCitations } from "@connectors/connectors/slack/chat/citations";
import { makeDustAppUrl } from "@connectors/connectors/slack/chat/utils";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

interface StreamConversationToSlackParams {
  assistantName: string | undefined;
  connector: ConnectorResource;
  conversation: ConversationType;
  mainMessage: ChatPostMessageResponse;
  slack: {
    slackChannelId: string;
    slackClient: WebClient;
    slackMessageTs: string;
  };
  userMessage: UserMessageType;
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
  }: StreamConversationToSlackParams
): Promise<Result<undefined, Error>> {
  const { slackChannelId, slackClient, slackMessageTs } = slack;

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
      ...makeMessageUpdateBlocksAndText(conversationUrl, messageUpdate),
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

  const conversationUrl = makeDustAppUrl(
    `/w/${connector.workspaceId}/assistant/${conversation.sId}`
  );

  // Immediately post the conversation URL once available.
  await postSlackMessageUpdate(
    { isThinking: true },
    { adhereToRateLimit: false }
  );

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
    conversation,
    message: agentMessage,
  });

  if (streamRes.isErr()) {
    return new Err(new Error(streamRes.error.message));
  }

  const botIdentity = assistantName ? `@${assistantName}:\n` : "";
  let answer = botIdentity;
  const actions: AgentActionType[] = [];
  for await (const event of streamRes.value.eventStream) {
    // This logger.info(Received event from Dust) is to be removed after august 30 2024.
    logger.info(
      {
        connectorId: connector.id,
        conversationId: conversation.sId,
        type: event.type,
      },
      "Received event from Dust"
    );
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
        await postSlackMessageUpdate({ text: slackContent, footnotes });
        break;
      }

      case "agent_message_success": {
        const finalAnswer = `${botIdentity}${event.message.content}`;
        const actions = event.message.actions;
        const { formattedContent, footnotes } = annotateCitations(
          finalAnswer,
          actions
        );
        const slackContent = slackifyMarkdown(
          normalizeContentForSlack(formattedContent)
        );

        await postSlackMessageUpdate(
          { text: slackContent, footnotes },
          { adhereToRateLimit: false }
        );

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
