import { isMessageClassification, MESSAGE_CLASSES } from "@dust-tt/types";
import OpenAI from "openai";

import { UserMessage } from "@app/lib/models";
import { Conversation, Message, Workspace } from "@app/lib/models";
import { UserMessageClassification } from "@app/lib/models/user_message_classification";

async function classifyUserMessage(userMessage: UserMessage) {
  if (!process.env.DUST_MANAGED_OPENAI_API_KEY) {
    throw new Error("DUST_MANAGED_OPENAI_API_KEY is not set");
  }
  const openai = new OpenAI({
    apiKey: process.env.DUST_MANAGED_OPENAI_API_KEY,
  });

  const prompt = `Classify this message as one class of the following classes: ${MESSAGE_CLASSES.join(
    ", "
  )}:`;
  const promptWithMessage = `${prompt}\n${userMessage.content}`;
  const chatCompletion = await openai.chat.completions.create({
    messages: [{ role: "user", content: promptWithMessage }],
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
  let count = 0;
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

  for (const conversation of conversations) {
    const messages = await Message.findAll({
      where: {
        conversationId: conversation.id,
      },
      attributes: ["id", "userMessageId"],
    });
    for (const message of messages) {
      if (message.userMessageId) {
        const userMessage = await UserMessage.findByPk(message.userMessageId);
        if (userMessage) {
          if (
            await UserMessageClassification.findOne({
              where: { userMessageId: userMessage.id },
            })
          ) {
            console.log("already classified", userMessage.id);
            continue;
          }
          const result = await classifyUserMessage(userMessage);
          console.log(
            `[%s] [%s]`,
            userMessage.content.substring(0, 10),
            result
          );
          if (result && isMessageClassification(result)) {
            await UserMessageClassification.upsert({
              messageClass: result,
              userMessageId: userMessage.id,
            });
            count++;
            if (count >= limit) {
              console.log("limit reached");
              return;
            }
          } else {
            console.log("could not classify message", userMessage.id);
          }
        }
      }
    }
  }
}
