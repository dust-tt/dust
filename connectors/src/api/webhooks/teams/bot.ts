import type {
  ConversationPublicType,
  LightAgentConfigurationType,
  Result,
  UserMessageType,
} from "@dust-tt/client";
import { DustAPI, Err, Ok } from "@dust-tt/client";
import type { Activity, TurnContext } from "botbuilder";
import removeMarkdown from "remove-markdown";
import jaroWinkler from "talisman/metrics/jaro-winkler";

import { apiConfig } from "@connectors/lib/api/config";
import { MicrosoftBotMessage } from "@connectors/lib/models/microsoft_bot";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import { getHeaderFromUserEmail } from "@connectors/types";

const DEFAULT_AGENTS = ["dust", "claude-4-sonnet", "gpt-5"];

import { getActionName } from "@connectors/lib/tools_utils";

import {
  createResponseAdaptiveCard,
  createStreamingAdaptiveCard,
  makeConversationUrl,
} from "./adaptive_cards";
import { sendActivity, updateActivity } from "./bot_messaging_utils";
import { validateTeamsUser } from "./user_validation";

export async function botAnswerMessage(
  context: TurnContext,
  message: string,
  connector: ConnectorResource,
  agentActivityId: string
): Promise<Result<undefined, Error>> {
  const {
    conversation: { id: conversationId },
    id: userActivityId,
    replyToId,
  } = context.activity;

  if (!userActivityId) {
    return new Err(new Error("No user activity ID found"));
  }

  // Validate user first - this will handle all user validation and error messaging
  const validatedUser = await validateTeamsUser(context, connector);
  if (!validatedUser) {
    // Error message already sent by validateTeamsUser
    return new Ok(undefined);
  }

  const { email, displayName, userAadObjectId } = validatedUser;

  // Check for existing Dust conversation for this Teams conversation
  const allMicrosoftBotMessages = await MicrosoftBotMessage.findAll({
    where: {
      connectorId: connector.id,
      conversationId: conversationId,
    },
    order: [["createdAt", "DESC"]],
  });

  // Find the most recent message that has a Dust conversation ID
  const lastMicrosoftBotMessage =
    allMicrosoftBotMessages.find((msg) => msg.dustConversationId) || null;

  const dustAPI = new DustAPI(
    { url: apiConfig.getDustFrontAPIUrl() },
    {
      workspaceId: connector.workspaceId,
      apiKey: connector.workspaceAPIKey,
      extraHeaders: {
        ...getHeaderFromUserEmail(email),
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
    let defaultAssistant: LightAgentConfigurationType | undefined = undefined;
    for (const agent of DEFAULT_AGENTS) {
      defaultAssistant = activeAgentConfigurations.find(
        (ac) => ac.sId === agent && ac.status === "active"
      );
      if (defaultAssistant) {
        break;
      }
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
      origin: "teams" as const,
    },
  };

  let conversation: ConversationPublicType | undefined = undefined;
  let userMessage: UserMessageType | undefined = undefined;

  if (lastMicrosoftBotMessage?.dustConversationId) {
    logger.info(
      {
        connectorId: connector.id,
        teamsConversationId: conversationId,
        dustConversationId: lastMicrosoftBotMessage.dustConversationId,
      },
      "Reusing existing Dust conversation for Teams conversation"
    );

    // Check conversation existence (it might have been deleted between two messages).
    const conversationRes = await dustAPI.getConversation({
      conversationId: lastMicrosoftBotMessage.dustConversationId,
    });

    // If it doesn't exist, we will create a new one later.
    if (conversationRes.isOk()) {
      const messageRes = await dustAPI.postUserMessage({
        conversationId: lastMicrosoftBotMessage.dustConversationId,
        message: messageReqBody,
      });
      if (messageRes.isErr()) {
        return new Err(new Error(messageRes.error.message));
      }
      userMessage = messageRes.value;

      // Reload conversation to get the latest state
      const newConversationRes = await dustAPI.getConversation({
        conversationId: lastMicrosoftBotMessage.dustConversationId,
      });
      if (newConversationRes.isErr()) {
        return new Err(new Error(newConversationRes.error.message));
      }
      conversation = newConversationRes.value;
    } else {
      logger.warn(
        {
          connectorId: connector.id,
          teamsConversationId: conversationId,
          dustConversationId: lastMicrosoftBotMessage.dustConversationId,
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

    const newConversationRes = await dustAPI.createConversation({
      title: null,
      visibility: "unlisted",
      message: messageReqBody,
    });
    if (newConversationRes.isErr()) {
      return new Err(new Error(newConversationRes.error.message));
    }

    conversation = newConversationRes.value.conversation;
    userMessage = newConversationRes.value.message;

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
  }

  await MicrosoftBotMessage.create({
    connectorId: connector.id,
    userAadObjectId: userAadObjectId,
    email: email,
    conversationId: conversationId,
    userActivityId: userActivityId,
    agentActivityId: agentActivityId,
    dustConversationId: conversation.sId,
    replyToId: replyToId,
  });

  // Stream agent response and send updates to Teams
  const streamAgentResponseRes = await streamAgentResponse({
    context,
    dustAPI,
    conversation,
    userMessage,
    mention,
    connector,
    agentActivityId,
  });

  if (streamAgentResponseRes.isErr()) {
    return streamAgentResponseRes;
  }

  const finalResponse = streamAgentResponseRes.value;

  const finalCard = createResponseAdaptiveCard({
    response: finalResponse,
    assistantName: mention.assistantName,
    conversationUrl: makeConversationUrl(
      connector.workspaceId,
      conversation.sId
    ),
    workspaceId: connector.workspaceId,
  });

  await sendTeamsResponse(context, agentActivityId, finalCard);

  // Return the result with streaming info
  return new Ok(undefined);
}

async function streamAgentResponse({
  context,
  dustAPI,
  conversation,
  userMessage,
  mention,
  connector,
  agentActivityId,
}: {
  context: TurnContext;
  dustAPI: DustAPI;
  conversation: ConversationPublicType;
  userMessage: UserMessageType;
  mention: { assistantName: string; assistantId: string };
  connector: ConnectorResource;
  agentActivityId: string;
}): Promise<Result<string, Error>> {
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
  let chainOfThought = "";
  let agentState = "thinking";
  const UPDATE_INTERVAL_MS = 100; // Update every 100 millisecond

  for await (const event of streamRes.value.eventStream) {
    switch (event.type) {
      case "agent_error": {
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
            await sendTeamsResponse(context, agentActivityId, streamingCard);
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
        await sendTeamsResponse(context, agentActivityId, streamingCard);

        break;
      }
      default:
        // Ignore other events
        break;
    }
  }

  if (agentMessageSuccess) {
    return new Ok(finalResponse);
  } else {
    return new Err(new Error("No response generated"));
  }
}

const sendTeamsResponse = async (
  context: TurnContext,
  agentActivityId: string | undefined,
  adaptiveCard: Partial<Activity>
): Promise<Result<string, Error>> => {
  // Update existing message for streaming
  if (agentActivityId) {
    try {
      await updateActivity(context, {
        ...adaptiveCard,
        id: agentActivityId,
      });
      return new Ok(agentActivityId);
    } catch (updateError) {
      logger.warn(
        { error: updateError },
        "Failed to update streaming message, sending new one"
      );
    }
  }

  // Send new streaming message
  return sendActivity(context, adaptiveCard);
};
