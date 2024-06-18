import type {
  AgentActionType,
  AgentMessageType,
  ConversationType,
  DustAPI,
  Result,
  UserMessageType,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { ChatPostMessageResponse, WebClient } from "@slack/web-api";
import slackifyMarkdown from "slackify-markdown";

import type { SlackMessageUpdate } from "@connectors/connectors/slack/chat/blocks";
import { makeMessageUpdateBlocksAndText } from "@connectors/connectors/slack/chat/blocks";
import { annotateCitations } from "@connectors/connectors/slack/chat/citations";
import { makeDustAppUrl } from "@connectors/connectors/slack/chat/utils";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

/*
 * After this length we start risking that the chat.update Slack API returns
 * "msg_too_long" error. This length is experimentally tested and was not found
 * in the slack documentation. Therefore, it is conservative and the actual
 * threshold might is more likely around 3800 characters. Since avoiding too
 * long messages in slack is a good thing nonetheless, we keep this lower threshold.
 */
const MAX_SLACK_MESSAGE_LENGTH = 3000;

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

  const postSlackMessageUpdate = async (messageUpdate: SlackMessageUpdate) => {
    await slackClient.chat.update({
      ...makeMessageUpdateBlocksAndText(conversationUrl, messageUpdate),
      channel: slackChannelId,
      thread_ts: slackMessageTs,
      ts: mainMessage.ts as string,
    });
  };

  const conversationUrl = makeDustAppUrl(
    `/w/${connector.workspaceId}/assistant/${conversation.sId}`
  );

  // Immediately post the conversation URL once available.
  await postSlackMessageUpdate({ isThinking: true });

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
  let fullAnswer = botIdentity;
  let action: AgentActionType | null = null;
  let lastSentDate = new Date();
  for await (const event of streamRes.value.eventStream) {
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

      case "generation_tokens": {
        if (event.classification !== "tokens") {
          continue;
        }
        fullAnswer += event.text;
        if (lastSentDate.getTime() + 1500 > new Date().getTime()) {
          continue;
        }
        lastSentDate = new Date();

        const finalAnswer = safelyPrepareAnswer(fullAnswer, action);
        // If the answer cannot be prepared safely, skip processing these tokens.
        if (!finalAnswer) {
          break;
        }

        // if the message is too long, we avoid the update entirely (to reduce
        // rate limiting) the previous update will have shown the "..." and the
        // link to continue the conversation so this is fine
        if (finalAnswer.length > MAX_SLACK_MESSAGE_LENGTH) {
          break;
        }

        await postSlackMessageUpdate({ text: finalAnswer });

        break;
      }

      case "agent_action_success": {
        action = event.action;
        break;
      }

      case "agent_generation_success": {
        fullAnswer = `${botIdentity}${event.text}`;

        let finalAnswer = slackifyMarkdown(
          normalizeContentForSlack(annotateCitations(fullAnswer, action))
        );

        // if the message is too long, when generation is finished we show it
        // is truncated
        if (finalAnswer.length > MAX_SLACK_MESSAGE_LENGTH) {
          finalAnswer =
            finalAnswer.slice(0, MAX_SLACK_MESSAGE_LENGTH) +
            "... (message truncated)";
        }

        await postSlackMessageUpdate({ text: finalAnswer });

        return new Ok(undefined);
      }

      default:
      // Nothing to do on unsupported events
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
function safelyPrepareAnswer(
  text: string,
  action: AgentActionType | null
): string | null {
  const rawAnswer = normalizeContentForSlack(annotateCitations(text, action));

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
