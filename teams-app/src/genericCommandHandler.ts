import { Selector } from "@microsoft/teams-ai";
import axios from "axios";
import { TurnContext } from "botbuilder";
import { ApplicationTurnState } from "./internal/interface";
import { createThinkingAdaptiveCard } from "./utils";

/**
 * The `GenericCommandHandler` registers patterns and responds
 * with appropriate messages if the user types general command inputs, such as "hi", "hello", and "help".
 */
export class GenericCommandHandler {
  triggerPatterns: string | RegExp | Selector | (string | RegExp | Selector)[] =
    new RegExp(/^.+$/);

  async handleCommandReceived(
    context: TurnContext,
    state: ApplicationTurnState,
    streamingMessages: Map<string, string>
  ): Promise<string | void> {
    // Send thinking message first and store activity ID for streaming
    const thinkingCard = createThinkingAdaptiveCard();
    const thinkingActivity = await context.sendActivity(thinkingCard);

    // Store the thinking message activity ID for streaming updates
    if (thinkingActivity?.id) {
      // Access the global streamingMessages map from index.ts
      streamingMessages.set(
        context.activity.conversation.id,
        thinkingActivity.id
      );
    }

    try {
      const webhookUrl =
        process.env.WEBHOOK_URL ||
        "http://localhost:3002/webhooks/mywebhooksecret/teams_bot";

      // Create webhook payload with response callback info
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
        // Add callback info for the webhook to respond back
        responseCallback: {
          serviceUrl: context.activity.serviceUrl,
          conversationId: context.activity.conversation.id,
          activityId: context.activity.id,
        },
      };

      // Call webhook asynchronously - don't wait for response
      axios
        .post(webhookUrl, webhookPayload, {
          headers: {
            "Content-Type": "application/json",
          },
          timeout: 30000, // 30 second timeout
        })
        .then((response) => {
          console.log(`Webhook called successfully: ${response.status}`);
        })
        .catch((error) => {
          console.error("Error calling webhook:", error);
          // Send error message via Bot Framework
          context.sendActivity(
            `❌ Sorry, I encountered an error: ${error.message}`
          );
        });

      // Return nothing - the webhook will handle the response via Bot Framework
      return undefined;
    } catch (error) {
      console.error("Error setting up webhook call:", error);
      return `❌ Failed to process request: ${error.message}`;
    }
  }
}
