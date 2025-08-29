import type {
  AgentMessageSuccessEvent,
  ConversationPublicType,
  LightAgentConfigurationType,
  Result,
  UserMessageType,
} from "@dust-tt/client";
import { DustAPI, Err, Ok } from "@dust-tt/client";
import removeMarkdown from "remove-markdown";
import jaroWinkler from "talisman/metrics/jaro-winkler";

import { getClient } from "@connectors/connectors/microsoft/index";
import { streamConversationToTeams } from "@connectors/connectors/teams/stream_conversation_handler";
import { apiConfig } from "@connectors/lib/api/config";
import { ProviderRateLimitError } from "@connectors/lib/error";
import { TeamsMessage } from "@connectors/lib/models/teams";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import { getHeaderFromUserEmail } from "@connectors/types";

const TEAMS_RATE_LIMIT_ERROR_MESSAGE =
  "Microsoft Teams has blocked the agent from continuing the conversation due to rate limits. You can retry the conversation later.";

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
  connector: ConnectorResource
): Promise<Result<undefined, Error>> {
  const { conversationId, tenantId } = params;

  try {
    const res = await answerTeamsMessage(message, params, connector);

    await processTeamsErrorResult(res, params, connector);

    return new Ok(undefined);
  } catch (e) {
    logger.error(
      {
        error: e,
        connectorId: connector.id,
        tenantId,
      },
      "Unexpected exception answering to Teams message"
    );

    try {
      const client = await getClient(connector.connectionId);
      if (e instanceof ProviderRateLimitError) {
        await client.api(`/me/chats/${conversationId}/messages`).post({
          body: {
            contentType: "text",
            content: TEAMS_RATE_LIMIT_ERROR_MESSAGE,
          },
        });
      } else {
        await client.api(`/me/chats/${conversationId}/messages`).post({
          body: {
            contentType: "text",
            content: "An unexpected error occurred. Our team has been notified",
          },
        });
      }
    } catch (e) {
      logger.error(
        {
          conversationId,
          tenantId,
          error: e,
        },
        "Failed to post error message to Teams"
      );
    }
    return new Err(new Error("An unexpected error occurred"));
  }
}

async function processTeamsErrorResult(
  res: Result<AgentMessageSuccessEvent | undefined, Error>,
  params: TeamsAnswerParams,
  connector: ConnectorResource
) {
  if (res.isErr()) {
    logger.error(
      {
        error: res.error,
        errorMessage: res.error.message,
        ...params,
      },
      "Failed answering to Teams message"
    );

    const errorMessage = `An error occurred: ${res.error.message}. Our team has been notified and will work on it as soon as possible.`;
    const { conversationId: convId } = params;

    try {
      const client = await getClient(connector.connectionId);
      await client.api(`/me/chats/${convId}/messages`).post({
        body: {
          contentType: "text",
          content: errorMessage,
        },
      });
    } catch (e) {
      logger.error(
        {
          error: e,
          conversationId: convId,
        },
        "Failed to post error message to Teams"
      );
    }
  } else {
    logger.info(
      {
        connectorId: connector.id,
        ...params,
      },
      "Successfully answered to Teams message"
    );
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
  connector: ConnectorResource
): Promise<Result<AgentMessageSuccessEvent | undefined, Error>> {
  // Check for existing conversation in the same thread
  let lastTeamsMessage: TeamsMessage | null = null;
  if (replyToId) {
    lastTeamsMessage = await TeamsMessage.findOne({
      where: {
        connectorId: connector.id,
        conversationId: conversationId,
        replyToId: replyToId,
      },
      order: [["createdAt", "DESC"]],
      limit: 1,
    });
  }

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

  // Extract all ~mentions and +mentions
  const mentionCandidates =
    messageWithoutMarkdown.match(
      /(?<!\S)[+~]([a-zA-Z0-9_-]{1,40})(?=\s|,|\.|$)/g
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

  // Send initial "thinking" message to Teams
  let mainMessageResponse: { id?: string } | null = null;
  try {
    mainMessageResponse = await client
      .api(`/me/chats/${conversationId}/messages`)
      .post({
        body: {
          contentType: "text",
          content: `🤔 ${mention.assistantName} is thinking...`,
        },
      });
  } catch (e) {
    logger.error(
      {
        error: e,
        conversationId,
        connectorId: connector.id,
      },
      "Failed to post thinking message to Teams"
    );
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
      origin: "slack" as const,
    },
  };

  let conversation: ConversationPublicType | undefined = undefined;
  let userMessage: UserMessageType | undefined = undefined;

  if (lastTeamsMessage?.dustConversationId) {
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
    }
  }

  if (!conversation || !userMessage) {
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

    teamsMessage.dustConversationId = conversation.sId;
    await teamsMessage.save();
  }

  const streamRes = await streamConversationToTeams(dustAPI, {
    assistantName: mention.assistantName,
    connector,
    conversation,
    mainMessageResponse,
    teams: {
      conversationId,
      client,
      activityId,
      channelId,
    },
    userMessage,
    teamsMessage,
    agentConfigurations: mostPopularAgentConfigurations,
  });

  if (streamRes.isErr()) {
    return new Err(new Error(streamRes.error.message));
  }

  return streamRes;
}
