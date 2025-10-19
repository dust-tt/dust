import type {
  ConversationPublicType,
  PublicPostContentFragmentRequestBody,
  PublicPostMessagesRequestBody,
  Result,
  UserMessageType,
} from "@dust-tt/client";
import { DustAPI, Err, Ok } from "@dust-tt/client";
import type { ChatMessage } from "@microsoft/microsoft-graph-types";
import type { Activity, TurnContext } from "botbuilder";
import removeMarkdown from "remove-markdown";

import { processFileAttachments } from "@connectors/api/webhooks/teams/content_fragments";
import { getMicrosoftClient } from "@connectors/connectors/microsoft/index";
import { getMessagesFromConversation } from "@connectors/connectors/microsoft/lib/graph_api";
import { apiConfig } from "@connectors/lib/api/config";
import { makeConversationUrl } from "@connectors/lib/bot/conversation_utils";
import { processMessageForMention } from "@connectors/lib/bot/mentions";
import { MicrosoftBotMessage } from "@connectors/lib/models/microsoft_bot";
import { getActionName } from "@connectors/lib/tools_utils";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import { getHeaderFromUserEmail } from "@connectors/types";

import {
  createResponseAdaptiveCard,
  createStreamingAdaptiveCard,
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

  // Extract all @mentions, ~mentions and +mentions (Teams typically uses @)
  const mentionResult = processMessageForMention({
    message: messageWithoutMarkdown,
    activeAgentConfigurations,
  });

  if (mentionResult.isErr()) {
    return new Err(mentionResult.error);
  }

  const mention = mentionResult.value.mention;
  message = mentionResult.value.processedMessage;

  const buildContentFragmentRes = await makeContentFragments(
    context,
    dustAPI,
    connector,
    lastMicrosoftBotMessage
  );

  if (buildContentFragmentRes.isErr()) {
    logger.error(
      {
        error: buildContentFragmentRes.error,
        connectorId: connector.id,
        teamsConversationId: conversationId,
      },
      "Failed to build content fragments"
    );
    // Continue without content fragments rather than failing completely
  }

  const messageReqBody: PublicPostMessagesRequestBody = {
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
      // Add content fragments if available
      if (buildContentFragmentRes.isOk() && buildContentFragmentRes.value) {
        for (const cf of buildContentFragmentRes.value) {
          const contentFragmentRes = await dustAPI.postContentFragment({
            conversationId: lastMicrosoftBotMessage.dustConversationId,
            contentFragment: cf,
          });
          if (contentFragmentRes.isErr()) {
            logger.error(
              {
                error: contentFragmentRes.error,
                connectorId: connector.id,
                teamsConversationId: conversationId,
              },
              "Failed to post content fragment"
            );
            // Continue without this content fragment
          }
        }
      }

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

  // If the conversation does not exist, we create a new one.
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
      contentFragments: buildContentFragmentRes.isOk()
        ? buildContentFragmentRes.value
        : undefined,
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

  const m = await MicrosoftBotMessage.create({
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

  const res = streamAgentResponseRes.value;

  m.update({
    dustAgentMessageId: res.agentMessageId,
  });

  const finalCard = createResponseAdaptiveCard({
    response: res.finalResponse,
    assistant: mention,
    conversationUrl: makeConversationUrl(
      connector.workspaceId,
      conversation.sId
    ),
    workspaceId: connector.workspaceId,
    agentConfigurations: activeAgentConfigurations,
    originalMessage: message,
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
}): Promise<Result<{ agentMessageId: string; finalResponse: string }, Error>> {
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
    return new Ok({
      agentMessageId: agentMessageSuccess.message.sId,
      finalResponse,
    });
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

async function makeContentFragments(
  context: TurnContext,
  dustAPI: DustAPI,
  connector: ConnectorResource,
  lastMicrosoftBotMessage: MicrosoftBotMessage | null
): Promise<Result<PublicPostContentFragmentRequestBody[] | undefined, Error>> {
  // Get Microsoft Graph client for authenticated file downloads
  const client = await getMicrosoftClient(connector.connectionId);
  const teamsConversationId = context.activity.conversation.id;

  // Detect conversation type based on ID pattern
  // Channel conversations typically contain thread patterns like @thread.tacv2
  // Chat conversations (1:1 or group) have different formats
  const isChannelConversation =
    teamsConversationId.includes("@thread.") ||
    teamsConversationId.includes("@teams.") ||
    context.activity.channelData?.teamsChannelId;

  // For regular chats (non-channel), we don't need message history
  // but we still want to process file attachments from the current message
  if (!isChannelConversation) {
    logger.info(
      {
        connectorId: connector.id,
        teamsConversationId,
      },
      "Processing current message attachments for Teams chat"
    );

    // Get current message attachments from the Bot Framework context
    const currentMessageAttachments = context.activity.attachments || [];

    if (currentMessageAttachments.length === 0) {
      return new Ok(undefined);
    }

    const allContentFragments = await processFileAttachments(
      currentMessageAttachments,
      dustAPI,
      client
    );

    logger.info(
      {
        connectorId: connector.id,
        attachments: allContentFragments.length,
      },
      `Processed ${allContentFragments.length} file attachments from Teams chat message`
    );

    return new Ok(
      allContentFragments.length > 0 ? allContentFragments : undefined
    );
  }

  // Get conversation history using the most reliable API approach
  const conversationHistory = await getMessagesFromConversation(
    logger,
    client,
    teamsConversationId
  );

  const messages: ChatMessage[] = conversationHistory.results || [];

  const startIndex =
    messages.findIndex((msg) => msg.id === context.activity.id) + 1;
  // Filter for new user messages since last bot interaction (excluded) or root message (included)
  const lastBotMessageId = lastMicrosoftBotMessage?.agentActivityId;
  const rootMessageId =
    teamsConversationId.match(/;messageid=([^;]+)/i)?.[1] || undefined;

  const endIndex = lastMicrosoftBotMessage
    ? messages.findIndex((msg) => msg.id === lastBotMessageId)
    : messages.findIndex((msg) => msg.id === rootMessageId) + 1;

  // Get only messages that come after the last bot message (or all if no previous bot message)
  const messagesToConsider =
    endIndex >= 0
      ? messages.slice(startIndex, endIndex)
      : messages.slice(startIndex);

  const newMessages = messagesToConsider.filter(
    (message) => message.from?.user
  );

  const allContentFragments: PublicPostContentFragmentRequestBody[] = [];

  // Process file attachments from both new messages AND the current message
  const allMessagesToCheckForFiles = [
    ...newMessages,
    // Add current message to check for attachments
    ...messages.filter((message) => {
      return message.id === context.activity.id;
    }),
  ];

  const allAttachments = allMessagesToCheckForFiles.flatMap(
    (m: ChatMessage) => m.attachments || []
  );

  // Upload file attachments
  const fileContentFragments = await processFileAttachments(
    allAttachments,
    dustAPI,
    client
  );

  allContentFragments.push(...fileContentFragments);

  // Create conversation history fragment
  const conversationText = newMessages
    .slice()
    .reverse()
    .map((msg: unknown) => {
      const message = msg as {
        from?: { user?: { displayName?: string } };
        createdDateTime?: string;
        body?: { content?: string };
      };
      const sender = message.from?.user?.displayName || "Unknown User";
      const timestamp = message.createdDateTime
        ? new Date(message.createdDateTime).toISOString()
        : "Unknown time";
      const content = (message.body?.content || "")
        .replace(/<[^>]*>/g, "")
        .trim();
      return `[${timestamp}] ${sender}: ${content}`;
    })
    .join("\n\n");

  const title = lastMicrosoftBotMessage
    ? "Teams - new messages"
    : "Teams conversation history";
  const fileName = `teams_conversation-${teamsConversationId}.txt`;

  const fileRes = await dustAPI.uploadFile({
    contentType: "text/plain",
    fileName,
    fileSize: conversationText.length,
    useCase: "conversation",
    useCaseMetadata: lastMicrosoftBotMessage
      ? { conversationId: lastMicrosoftBotMessage.conversationId }
      : undefined,
    fileObject: new File([conversationText], fileName, {
      type: "text/plain",
    }),
  });

  if (fileRes.isOk()) {
    allContentFragments.push({
      title,
      url: null,
      fileId: fileRes.value.sId,
      context: null,
    });
  }

  return new Ok(
    allContentFragments.length > 0 ? allContentFragments : undefined
  );
}

export async function sendFeedback({
  context,
  connector,
  thumbDirection,
}: {
  context: TurnContext;
  connector: ConnectorResource;
  thumbDirection: "up" | "down";
}) {
  // Validate user first
  const validatedUser = await validateTeamsUser(context, connector);
  if (!validatedUser) {
    logger.error("Failed to validate Teams user for feedback");
    return false;
  }

  const { email, displayName } = validatedUser;

  const conversationId = context.activity.conversation?.id;
  const replyTo = context.activity.replyToId;

  if (!conversationId || !replyTo) {
    logger.error("No conversation ID or reply to ID found in activity");
    return false;
  }

  // Find the MicrosoftBotMessage to get the Dust conversation ID
  const microsoftBotMessage = await MicrosoftBotMessage.findOne({
    where: {
      connectorId: connector.id,
      conversationId: conversationId,
      agentActivityId: replyTo,
    },
    order: [["createdAt", "DESC"]],
  });

  if (!microsoftBotMessage || !microsoftBotMessage.dustConversationId) {
    logger.error(
      "No MicrosoftBotMessage found for conversation ID and reply to ID"
    );
    return false;
  }

  // const dustAPI = new DustAPI(
  //   { url: apiConfig.getDustFrontAPIUrl() },
  //   {
  //     workspaceId: connector.workspaceId,
  //     apiKey: connector.workspaceAPIKey,
  //     extraHeaders: {
  //       ...getHeaderFromUserEmail(email),
  //     },
  //   },
  //   logger
  // );

  // Submit feedback using DustAPI
  // const feedbackRes = await dustAPI.postFeedback(
  //   microsoftBotMessage.dustConversationId,
  //   agentMessageId,
  //   {
  //     thumbDirection,
  //     feedbackContent: null,
  //     isConversationShared: true, // Teams feedback is considered shared
  //   }
  // );

  logger.info(
    {
      dustConversationId: microsoftBotMessage.dustConversationId,
      thumbDirection,
      userEmail: email,
      userDisplayName: displayName,
    },
    "Feedback submitted from Teams"
  );

  return true;
}
