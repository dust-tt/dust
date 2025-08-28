import type {
  AgentMessageSuccessEvent,
  ConversationPublicType,
  DustAPI,
  LightAgentConfigurationType,
  Result,
  UserMessageType,
} from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { Client } from "@microsoft/microsoft-graph-client";

import type { TeamsMessage } from "@connectors/lib/models/teams";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

interface StreamToTeamsParams {
  assistantName: string;
  connector: ConnectorResource;
  conversation: ConversationPublicType;
  mainMessageResponse: { id?: string } | null;
  teams: {
    conversationId: string;
    client: Client;
    activityId: string;
    channelId: string;
  };
  userMessage: UserMessageType;
  teamsMessage: TeamsMessage;
  agentConfigurations: LightAgentConfigurationType[];
}

export async function streamConversationToTeams(
  dustAPI: DustAPI,
  params: StreamToTeamsParams
): Promise<Result<AgentMessageSuccessEvent | undefined, Error>> {
  const {
    connector,
    conversation,
    teams: { conversationId, client },
    userMessage,
    assistantName,
  } = params;

  try {
    // Stream the conversation from Dust API
    const streamRes = await dustAPI.streamAgentAnswerEvents({
      conversation,
      userMessageId: userMessage.sId,
    });

    if (streamRes.isErr()) {
      return new Err(new Error(streamRes.error.message));
    }

    let fullResponse = "";
    let lastUpdateTime = Date.now();
    const UPDATE_INTERVAL = 2000; // Update every 2 seconds

    for await (const event of streamRes.value.eventStream) {
      switch (event.type) {
        case "agent_error":
        case "user_message_error":
        case "tool_error": {
          logger.error(
            {
              error: event.error,
              conversationId: conversation.sId,
              connectorId: connector.id,
            },
            "Error streaming conversation to Teams"
          );
          return new Err(new Error(event.error.message));
        }

        case "agent_message_success": {
          // Final message - update with complete response
          const finalAnswer = event.message.content ?? "";
          
          try {
            if (params.mainMessageResponse?.id) {
                await client.api(`/v1.0/me/chats/${conversationId}/messages/${params.mainMessageResponse.id}`).patch({
                body: {
                  contentType: 'text',
                  content: `**${assistantName}**: ${finalAnswer}`
                }
              });
            }
          } catch (e) {
            logger.error(
              {
                error: e,
                conversationId,
                connectorId: connector.id,
              },
              "Failed to update final message in Teams"
            );
          }

          return new Ok(event);
        }

        case "generation_tokens": {
          if (event.classification !== "tokens") {
            continue;
          }

          // Accumulate the response text
          fullResponse += event.text;

          // Update Teams message periodically to show progress
          const now = Date.now();
          if (now - lastUpdateTime > UPDATE_INTERVAL && fullResponse.trim()) {
            lastUpdateTime = now;
            
            try {
              if (params.mainMessageResponse?.id) {
                  await client.api(`/v1.0/me/chats/${conversationId}/messages/${params.mainMessageResponse.id}`).patch({
                  body: {
                    contentType: 'text',
                    content: `**${assistantName}**: ${fullResponse}...`
                  }
                });
              }
            } catch (e) {
              logger.warn(
                {
                  error: e,
                  conversationId,
                  connectorId: connector.id,
                },
                "Failed to update message in Teams during streaming"
              );
            }
          }
          break;
        }

        default:
          // Ignore other event types
          break;
      }
    }

    // If we get here without a success event, something went wrong
    return new Err(new Error("Streaming ended without success event"));

  } catch (error) {
    logger.error(
      {
        error,
        conversationId: conversation.sId,
        connectorId: connector.id,
      },
      "Error in streamConversationToTeams"
    );

    try {
      if (params.mainMessageResponse?.id) {
          await client.api(`/v1.0/me/chats/${conversationId}/messages/${params.mainMessageResponse.id}`).patch({
          body: {
            contentType: 'text',
            content: `❌ An error occurred while processing your request. Our team has been notified.`
          }
        });
      }
    } catch (e) {
      logger.error(
        {
          error: e,
          conversationId,
          connectorId: connector.id,
        },
        "Failed to send error message to Teams"
      );
    }

    return new Err(new Error(`Failed to stream conversation: ${error}`));
  }
}