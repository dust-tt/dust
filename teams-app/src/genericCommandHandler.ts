import { Selector } from "@microsoft/teams-ai";
import axios from "axios";
import { Activity, TurnContext } from "botbuilder";
import { ApplicationTurnState } from "./internal/interface";

/**
 * The `GenericCommandHandler` registers patterns and responds
 * with appropriate messages if the user types general command inputs, such as "hi", "hello", and "help".
 */
export class GenericCommandHandler {
  triggerPatterns: string | RegExp | Selector | (string | RegExp | Selector)[] =
    new RegExp(/^.+$/);

  async handleCommandReceived(
    context: TurnContext,
    state: ApplicationTurnState
  ): Promise<string | Partial<Activity> | void> {
    console.log(`App received message: ${context.activity.text}`);

    if (context.activity.text.startsWith("@dust")) {
      // Post message to webhook
      try {
        const webhookUrl =
          process.env.WEBHOOK_URL ||
          "http://localhost:3002/webhooks/mywebhooksecret/teams_bot";

        // Create webhook payload matching our Teams webhook implementation
        const webhookPayload = {
          type: "message",
          tenantId: context.activity.conversation?.tenantId || "unknown-tenant",
          activity: {
            type: "message",
            id: context.activity.id,
            timestamp: context.activity.timestamp,
            channelId: context.activity.channelId,
            from: {
              id: context.activity.from.id,
              name: context.activity.from.name,
              aadObjectId: context.activity.from.aadObjectId,
            },
            conversation: {
              id: context.activity.conversation.id,
              name: context.activity.conversation.name,
              conversationType: context.activity.conversation.conversationType,
              tenantId: context.activity.conversation.tenantId,
            },
            recipient: {
              id: context.activity.recipient?.id,
              name: context.activity.recipient?.name,
            },
            text: context.activity.text,
            textFormat: context.activity.textFormat,
            locale: context.activity.locale,
            replyToId: context.activity.replyToId,
          },
        };

        const response = await axios.post(webhookUrl, webhookPayload, {
          headers: {
            "Content-Type": "application/json",
          },
        });

        console.log(
          `Message posted to webhook successfully: ${response.status}`
        );
        return `Message "${context.activity.text}" has been sent to Dust AI for processing...`;
      } catch (error) {
        console.error("Error posting to webhook:", error);
        return `Failed to post message to webhook: ${
          error.response?.data || error.message
        }`;
      }
    }

    // Handle other messages
    return `Received: ${context.activity.text}. Try starting with "@dust" to interact with the AI assistant.`;
  }
}
