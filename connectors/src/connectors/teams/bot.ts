import type {
  AgentActionPublicType,
  ConversationPublicType,
  LightAgentConfigurationType,
  Result,
  UserMessageType,
} from "@dust-tt/client";
import { DustAPI, Err, Ok } from "@dust-tt/client";
import axios from "axios";
import type { Activity, TurnContext } from "botbuilder";
import removeMarkdown from "remove-markdown";
import jaroWinkler from "talisman/metrics/jaro-winkler";

import { getClient } from "@connectors/connectors/microsoft/index";
import {
  createErrorAdaptiveCard,
  createResponseAdaptiveCard,
  createStreamingAdaptiveCard,
  makeConversationUrl,
} from "@connectors/connectors/teams/adaptive_cards";
import {
  sendActivity,
  updateActivity,
} from "@connectors/connectors/teams/bot_messaging_utils";
import { apiConfig } from "@connectors/lib/api/config";
import { TeamsMessage } from "@connectors/lib/models/teams";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import { getHeaderFromUserEmail } from "@connectors/types";

type TeamsAnswerParams = {
  tenantId: string;
  conversationId: string;
  userId: string;
  userAadObjectId?: string;
  activityId: string;
  channelId: string;
  replyToId?: string;
};

export async function botAnswerTeamsMessage(
  message: string,
  params: TeamsAnswerParams,
  connector: ConnectorResource,
  responseCallback: {
    serviceUrl: string;
    conversationId: string;
    activityId: string;
    userId?: string;
    botContext?: TurnContext; // Direct Bot Framework context
    streamingMessages?: Map<string, string>;
  }
): Promise<Result<undefined, Error>> {
  const { tenantId } = params;

  try {
    const res = await answerTeamsMessage(
      message,
      params,
      connector,
      responseCallback
    );

    if (res.isErr()) {
      await sendTeamsResponse(
        responseCallback,
        false,
        createErrorAdaptiveCard({
          error: res.error.message,
          workspaceId: connector.workspaceId,
        })
      );
    }

    return res;
  } catch (e) {
    logger.error(
      {
        error: e,
        connectorId: connector.id,
        tenantId,
      },
      "Unexpected exception answering to Teams message"
    );

    await sendTeamsResponse(
      responseCallback,
      false,
      createErrorAdaptiveCard({
        error: "An unexpected error occurred. Our team has been notified",
        workspaceId: connector.workspaceId,
      })
    );
    return new Err(new Error("An unexpected error occurred"));
  }
}

async function answerTeamsMessage(
  message: string,
  {
    conversationId,
    userId,
    userAadObjectId,
    activityId,
    channelId,
    replyToId,
  }: TeamsAnswerParams,
  connector: ConnectorResource,
  responseCallback: {
    serviceUrl: string;
    conversationId: string;
    activityId: string;
    userId?: string;
  }
): Promise<Result<undefined, Error>> {
  // Check for existing Dust conversation for this Teams conversation
  let lastTeamsMessage: TeamsMessage | null = null;

  // Always look for previous messages in the same Teams conversation
  // to maintain conversation continuity - first try to find one with dustConversationId
  const allTeamsMessages = await TeamsMessage.findAll({
    where: {
      connectorId: connector.id,
      conversationId: conversationId,
    },
    order: [["createdAt", "DESC"]],
  });

  // Find the most recent message that has a Dust conversation ID
  lastTeamsMessage =
    allTeamsMessages.find((msg) => msg.dustConversationId) || null;

  // Get Microsoft Graph client
  const client = await getClient(connector.connectionId);

  // Get user info from Microsoft Graph
  let userInfo: {
    id: string;
    displayName?: string;
    mail?: string;
    userPrincipalName?: string;
  } | null = null;
  try {
    if (userAadObjectId) {
      userInfo = await client.api(`/users/${userAadObjectId}`).get();
    } else {
      // Fallback: try to get user info by userId (though this might not work for all scenarios)
      userInfo = await client.api(`/users/${userId}`).get();
    }
  } catch (e) {
    logger.warn(
      {
        error: e,
        userId,
        userAadObjectId,
        connectorId: connector.id,
      },
      "Failed to get user info from Microsoft Graph"
    );
    // Create minimal user info
    userInfo = {
      id: userId,
      displayName: "Unknown User",
      mail: "unknown@example.com",
    };
  }

  const displayName = userInfo?.displayName || "Unknown User";
  const email =
    userInfo?.mail || userInfo?.userPrincipalName || "unknown@example.com";

  const teamsMessage = await TeamsMessage.create({
    connectorId: connector.id,
    message: message,
    userId: userId,
    userAadObjectId: userAadObjectId,
    email: email,
    userName: displayName,
    conversationId: conversationId,
    activityId: activityId,
    channelId: channelId,
    replyToId: replyToId,
    dustConversationId: lastTeamsMessage?.dustConversationId,
  });

  const dustAPI = new DustAPI(
    { url: apiConfig.getDustFrontAPIUrl() },
    {
      workspaceId: connector.workspaceId,
      apiKey: connector.workspaceAPIKey,
      extraHeaders: {
        ...getHeaderFromUserEmail(
          email !== "unknown@example.com" ? email : undefined
        ),
      },
    },
    logger
  );

  const agentConfigurationsRes = await dustAPI.getAgentConfigurations({});
  if (agentConfigurationsRes.isErr()) {
    return new Err(new Error(agentConfigurationsRes.error.message));
  }

  const activeAgentConfigurations = agentConfigurationsRes.value.filter(
    (ac) => ac.status === "active"
  );

  // Process mentions in Teams messages (similar to Slack but for Teams format)
  // Teams mentions come in a different format than Slack
  const messageWithoutMarkdown = removeMarkdown(message);

  let mention: { assistantName: string; assistantId: string } | undefined;

  // Extract all @mentions, ~mentions and +mentions (Teams typically uses @)
  const mentionCandidates =
    messageWithoutMarkdown.match(
      /(?<!\S)[@+~]([a-zA-Z0-9_-]{1,40})(?=\s|,|\.|$|)/g
    ) || [];

  if (mentionCandidates.length > 1) {
    return new Err(
      new Error("Only one agent at a time can be called through Teams.")
    );
  }

  const [mentionCandidate] = mentionCandidates;
  if (mentionCandidate) {
    let bestCandidate:
      | {
          assistantId: string;
          assistantName: string;
          distance: number;
        }
      | undefined = undefined;

    for (const agentConfiguration of activeAgentConfigurations) {
      const distance =
        1 -
        jaroWinkler(
          mentionCandidate.slice(1).toLowerCase(),
          agentConfiguration.name.toLowerCase()
        );

      if (bestCandidate === undefined || bestCandidate.distance > distance) {
        bestCandidate = {
          assistantId: agentConfiguration.sId,
          assistantName: agentConfiguration.name,
          distance: distance,
        };
      }
    }

    if (bestCandidate) {
      mention = {
        assistantId: bestCandidate.assistantId,
        assistantName: bestCandidate.assistantName,
      };
      message = message.replace(
        mentionCandidate,
        `:mention[${bestCandidate.assistantName}]{sId=${bestCandidate.assistantId}}`
      );
    } else {
      return new Err(
        new Error(`Assistant ${mentionCandidate} has not been found.`)
      );
    }
  }

  if (!mention) {
    // Use default agent if no mention found
    let defaultAssistant: LightAgentConfigurationType | null = null;
    defaultAssistant =
      activeAgentConfigurations.find((ac) => ac.sId === "dust") || null;
    if (!defaultAssistant || defaultAssistant.status !== "active") {
      defaultAssistant =
        activeAgentConfigurations.find((ac) => ac.sId === "gpt-4") || null;
    }
    if (!defaultAssistant) {
      return new Err(
        new Error("No agent has been configured to reply on Teams.")
      );
    }
    mention = {
      assistantId: defaultAssistant.sId,
      assistantName: defaultAssistant.name,
    };
  }

  const mostPopularAgentConfigurations = [...activeAgentConfigurations]
    .sort((a, b) => (b.usage?.messageCount ?? 0) - (a.usage?.messageCount ?? 0))
    .splice(0, 100)
    .sort((a, b) => a.name.localeCompare(b.name));

  // Skip Graph API messaging - Teams app handles "thinking" message via Bot Framework

  if (!message.includes(":mention")) {
    // if the message does not contain the mention, we add it as a prefix.
    message = `:mention[${mention.assistantName}]{sId=${mention.assistantId}} ${message}`;
  }

  const messageReqBody = {
    content: message,
    mentions: [{ configurationId: mention.assistantId }],
    context: {
      timezone: "UTC", // Teams doesn't provide timezone info easily
      username: displayName,
      fullName: displayName,
      email: email,
      profilePictureUrl: null,
      origin: "slack" as const,
    },
  };

  let conversation: ConversationPublicType | undefined = undefined;
  let userMessage: UserMessageType | undefined = undefined;

  if (lastTeamsMessage?.dustConversationId) {
    logger.info(
      {
        connectorId: connector.id,
        teamsConversationId: conversationId,
        dustConversationId: lastTeamsMessage.dustConversationId,
      },
      "Reusing existing Dust conversation for Teams conversation"
    );

    // Check conversation existence (it might have been deleted between two messages).
    const existsRes = await dustAPI.getConversation({
      conversationId: lastTeamsMessage.dustConversationId,
    });

    // If it doesn't exist, we will create a new one later.
    if (existsRes.isOk()) {
      const messageRes = await dustAPI.postUserMessage({
        conversationId: lastTeamsMessage.dustConversationId,
        message: messageReqBody,
      });
      if (messageRes.isErr()) {
        return new Err(new Error(messageRes.error.message));
      }
      userMessage = messageRes.value;

      const conversationRes = await dustAPI.getConversation({
        conversationId: lastTeamsMessage.dustConversationId,
      });
      if (conversationRes.isErr()) {
        return new Err(new Error(conversationRes.error.message));
      }
      conversation = conversationRes.value;
    } else {
      logger.warn(
        {
          connectorId: connector.id,
          teamsConversationId: conversationId,
          dustConversationId: lastTeamsMessage.dustConversationId,
        },
        "Dust conversation not found, will create new one"
      );
    }
  }

  if (!conversation || !userMessage) {
    logger.info(
      {
        connectorId: connector.id,
        teamsConversationId: conversationId,
      },
      "Creating new Dust conversation for Teams conversation"
    );

    const convRes = await dustAPI.createConversation({
      title: null,
      visibility: "unlisted",
      message: messageReqBody,
    });
    if (convRes.isErr()) {
      return new Err(new Error(convRes.error.message));
    }

    conversation = convRes.value.conversation;
    userMessage = convRes.value.message;

    if (!userMessage) {
      return new Err(new Error("Failed to retrieve the created message."));
    }

    logger.info(
      {
        connectorId: connector.id,
        teamsConversationId: conversationId,
        dustConversationId: conversation.sId,
      },
      "Created new Dust conversation and linked to Teams conversation"
    );

    teamsMessage.dustConversationId = conversation.sId;
    await teamsMessage.save();
  }

  // For Bot Framework approach with streaming updates
  const streamRes = await dustAPI.streamAgentAnswerEvents({
    conversation,
    userMessageId: userMessage.sId,
  });

  if (streamRes.isErr()) {
    return new Err(new Error(streamRes.error.message));
  }

  // Collect the full response and stream updates
  let finalResponse = "";
  let agentMessageSuccess = undefined;
  let lastUpdateTime = Date.now();
  let streamingUsed = false;
  let chainOfThought = "";
  let agentState = "thinking";
  const UPDATE_INTERVAL_MS = 100; // Update every second

  for await (const event of streamRes.value.eventStream) {
    switch (event.type) {
      case "agent_error":
      case "user_message_error":
      case "tool_error": {
        return new Err(new Error(event.error.message));
      }
      case "agent_message_success": {
        agentMessageSuccess = event;
        finalResponse = event.message.content ?? "";
        break;
      }
      case "generation_tokens": {
        // Stream updates at intervals to avoid rate limits
        if (event.classification === "tokens") {
          finalResponse += event.text;
          agentState = "writing";
        } else if (event.classification === "chain_of_thought") {
          if (event.text === "\n\n") {
            chainOfThought = "";
          } else {
            chainOfThought += event.text;
          }
          agentState = "thinking";
        }

        const now = Date.now();
        if (now - lastUpdateTime > UPDATE_INTERVAL_MS) {
          lastUpdateTime = now;
          streamingUsed = true;
          const text =
            agentState === "thinking" ? chainOfThought : finalResponse;
          if (text.trim()) {
            const streamingCard = createStreamingAdaptiveCard({
              response: text,
              assistantName: mention.assistantName,
              conversationUrl: null,
              workspaceId: connector.workspaceId,
            });

            // Send streaming update to Teams app webhook endpoint
            await sendTeamsResponse(responseCallback, true, streamingCard);
          }
        }
        break;
      }
      case "tool_params": {
        const action = getActionName(event.action);
        const streamingCard = createStreamingAdaptiveCard({
          response: action,
          assistantName: mention.assistantName,
          conversationUrl: null,
          workspaceId: connector.workspaceId,
        });
        agentState = "acting";
        await sendTeamsResponse(responseCallback, true, streamingCard);

        break;
      }
      default:
        // Ignore other events
        break;
    }
  }

  if (agentMessageSuccess) {
    // Send final clean message if streaming was used
    if (streamingUsed && responseCallback) {
      try {
        const finalCard = createResponseAdaptiveCard({
          response: finalResponse,
          assistantName: mention.assistantName,
          conversationUrl: makeConversationUrl(
            connector.workspaceId,
            conversation.sId
          ),
          workspaceId: connector.workspaceId,
          agentConfigurations: mostPopularAgentConfigurations,
          originalMessage: message,
        });

        await sendTeamsResponse(responseCallback, false, finalCard);
      } catch (finalError) {
        logger.warn(
          { error: finalError },
          "Failed to send final message to Teams"
        );
      }
    }

    // Return the result with streaming info
    return new Ok(undefined);
  } else {
    return new Err(new Error("No response generated"));
  }
}

const sendTeamsResponse = async (
  responseCallback: {
    serviceUrl: string;
    conversationId: string;
    activityId: string;
    userId?: string;
    botContext?: TurnContext;
    streamingMessages?: Map<string, string>;
  },
  isStreaming: boolean,
  adaptiveCard: Partial<Activity>
) => {
  try {
    // If we have direct Bot Framework context, use it directly
    if (responseCallback.botContext && responseCallback.streamingMessages) {
      const context = responseCallback.botContext;
      const streamingMessages = responseCallback.streamingMessages;
      const conversationId = responseCallback.conversationId;

      if (isStreaming) {
        // Update existing message for streaming
        const existingActivityId = streamingMessages.get(conversationId);
        if (existingActivityId) {
          try {
            await updateActivity(context, {
              ...adaptiveCard,
              id: existingActivityId,
            });
            return;
          } catch (updateError) {
            logger.warn(
              { error: updateError },
              "Failed to update streaming message, sending new one"
            );
          }
        }

        // Send new streaming message
        const sentActivity = await sendActivity(context, adaptiveCard);
        if (sentActivity?.id) {
          streamingMessages.set(conversationId, sentActivity.id);
        }
      } else {
        // Final message - send and clean up
        await sendActivity(context, adaptiveCard);
        streamingMessages.delete(conversationId);
      }
      return;
    }

    // Fallback to webhook approach (for backward compatibility) -- to remove in the future
    const teamsAppUrl = process.env.TEAMS_APP_URL || "http://localhost:3978";
    const teamsUrl = `${teamsAppUrl}/api/webhook-response`;

    await axios.post(
      teamsUrl,
      {
        serviceUrl: responseCallback.serviceUrl,
        conversationId: responseCallback.conversationId,
        activityId: responseCallback.activityId,
        userId: responseCallback.userId,
        isStreaming,
        adaptiveCard,
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 5000,
      }
    );
  } catch (updateError) {
    logger.warn(
      { error: updateError },
      "Failed to send streaming update to Teams"
    );
  }
};

export const SEARCH_TOOL_NAME = "semantic_search";
export const INCLUDE_TOOL_NAME = "retrieve_recent_documents";
export const WEBSEARCH_TOOL_NAME = "websearch";
export const WEBBROWSER_TOOL_NAME = "webbrowser";
export const QUERY_TABLES_TOOL_NAME = "query_tables";
export const GET_DATABASE_SCHEMA_TOOL_NAME = "get_database_schema";
export const EXECUTE_DATABASE_QUERY_TOOL_NAME = "execute_database_query";
export const PROCESS_TOOL_NAME = "extract_information_from_documents";
export const RUN_AGENT_TOOL_NAME = "run_agent";
export const CREATE_AGENT_TOOL_NAME = "create_agent";
export const FIND_TAGS_TOOL_NAME = "find_tags";
export const FILESYSTEM_CAT_TOOL_NAME = "cat";
export const FILESYSTEM_FIND_TOOL_NAME = "find";
export const FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME = "locate_in_tree";
export const FILESYSTEM_LIST_TOOL_NAME = "list";

const getActionName = (action: AgentActionPublicType) => {
  const { functionCallName, internalMCPServerName } = action;

  const parts = functionCallName ? functionCallName.split("__") : [];
  const toolName = parts[parts.length - 1];

  if (
    internalMCPServerName === "search" ||
    internalMCPServerName === "data_sources_file_system"
  ) {
    if (toolName === SEARCH_TOOL_NAME) {
      return "Searching";
    }

    if (
      toolName === FILESYSTEM_LIST_TOOL_NAME ||
      toolName === FILESYSTEM_FIND_TOOL_NAME
    ) {
      return "Browsing data sources";
    }

    if (toolName === FILESYSTEM_CAT_TOOL_NAME) {
      return "Viewing data source";
    }

    if (toolName === FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME) {
      return "Locating in tree";
    }
  }

  if (internalMCPServerName === "include_data") {
    if (toolName === INCLUDE_TOOL_NAME) {
      return "Including data";
    }
  }

  if (internalMCPServerName === "web_search_&_browse") {
    if (toolName === WEBSEARCH_TOOL_NAME) {
      return "Searching the web";
    }
    if (toolName === WEBBROWSER_TOOL_NAME) {
      return "Browsing the web";
    }
  }

  if (internalMCPServerName === "query_tables") {
    if (toolName === QUERY_TABLES_TOOL_NAME) {
      return "Querying tables";
    }
  }

  if (internalMCPServerName === "query_tables_v2") {
    if (toolName === GET_DATABASE_SCHEMA_TOOL_NAME) {
      return "Getting database schema";
    }
    if (toolName === EXECUTE_DATABASE_QUERY_TOOL_NAME) {
      return "Executing database query";
    }
  }

  if (internalMCPServerName === "reasoning") {
    return "Reasoning";
  }

  if (internalMCPServerName === "extract_data") {
    if (toolName === PROCESS_TOOL_NAME) {
      return "Extracting data";
    }
  }

  return "Executing tool";
};
