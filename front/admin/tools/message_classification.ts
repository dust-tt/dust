import { isMessageClassification, MESSAGE_CLASSES } from "@dust-tt/types";
import OpenAI from "openai";

import { UserMessage } from "@app/lib/models";
import { Conversation, Message, Workspace } from "@app/lib/models";
import { ConversationClassification } from "@app/lib/models/conversation_classification";

function cleanupAssistantMentions(message: string) {
  let shouldContinue = true;
  do {
    const mentionCandidates = message.match(/:mention\[(.*)\]{sId=(.*)}/);

    if (mentionCandidates && mentionCandidates.length >= 2) {
      shouldContinue = true;
      message = message.replace(
        mentionCandidates[0],
        `@${mentionCandidates[1]}`
      );
    } else {
      shouldContinue = false;
    }
  } while (shouldContinue);

  return message;
}

async function classifyConversation(content: string) {
  if (!process.env.DUST_MANAGED_OPENAI_API_KEY) {
    throw new Error("DUST_MANAGED_OPENAI_API_KEY is not set");
  }
  const openai = new OpenAI({
    apiKey: process.env.DUST_MANAGED_OPENAI_API_KEY,
  });

  const prompt = `Classify this message as one class of the following classes: ${MESSAGE_CLASSES.join(
    ", "
  )}:\n\n`;

  const promptWithContent = `${prompt}\n${content}`;
  console.log("promptWithContent", promptWithContent);
  const chatCompletion = await openai.chat.completions.create({
    messages: [{ role: "user", content: promptWithContent }],
    model: "gpt-3.5-turbo",
    functions: [
      {
        name: "message_classified",
        description:
          "This function classify messages from users into one of the following classes: " +
          MESSAGE_CLASSES.join(", "),
        parameters: {
          type: "object",
          properties: {
            class: {
              type: "string",
            },
          },
        },
      },
    ],
  });

  if (chatCompletion.choices[0].message.function_call?.arguments) {
    const parsed: { class: string } = JSON.parse(
      chatCompletion.choices[0].message.function_call?.arguments
    );
    return parsed.class;
  }
}

export async function classifyWorkspace({
  workspaceId,
  limit,
}: {
  workspaceId: string;
  limit: number;
}) {
  const workspace = await Workspace.findOne({
    where: {
      sId: workspaceId,
    },
  });
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }
  // Get conversations of the workspace, then messages, then user messages.
  const conversations = await Conversation.findAll({
    where: {
      workspaceId: workspace.id,
    },
    attributes: ["id"],
    limit: limit,
    order: [["id", "DESC"]],
  });
  console.log("conversations", conversations.length);

  for (const conversation of conversations) {
    const messages = await Message.findAll({
      where: {
        conversationId: conversation.id,
      },
      attributes: ["id", "userMessageId"],
      order: [["id", "ASC"]],
    });
    if (messages.length > 30) {
      console.log("too many messages", conversation.id);
      continue;
    }
    const renderedConversation: { username: string; content: string }[] = [];
    for (const message of messages) {
      if (message.userMessageId) {
        const userMessage = await UserMessage.findByPk(message.userMessageId);
        if (!userMessage) {
          console.log("user message not found", message.userMessageId);
          continue;
        }
        renderedConversation.push({
          username:
            userMessage.userContextFullName ||
            userMessage.userContextEmail ||
            userMessage.userContextUsername,
          content: userMessage.content,
        });
      }
    }
    if (renderedConversation.length > 0) {
      let renderedConversationString = renderedConversation
        .map((message) => `${message.username}: ${message.content}`)
        .join("\n");

      renderedConversationString = cleanupAssistantMentions(
        renderedConversationString
      );
      const result = await classifyConversation(renderedConversationString);
      console.log(
        `[%s] [%s]\n\n--------------\n\n`,
        renderedConversationString.substring(0, 250),
        result
      );
      if (result && isMessageClassification(result)) {
        await ConversationClassification.upsert({
          messageClass: result,
          conversationId: conversation.id,
        });
      } else {
        console.log("could not classify message", conversation.id);
      }
    }
  }
}
