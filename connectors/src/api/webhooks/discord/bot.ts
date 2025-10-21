import type {
  AgentActionPublicType,
  AgentMessageSuccessEvent,
  ConversationPublicType,
  LightAgentConfigurationType,
  Result,
} from "@dust-tt/client";
import { DustAPI, Err, Ok } from "@dust-tt/client";

import { makeDiscordContentFragments } from "@connectors/api/webhooks/discord/content_fragments";
import { DISCORD_API_BASE_URL } from "@connectors/api/webhooks/discord/utils";
import { apiConfig } from "@connectors/lib/api/config";
import type { MessageFootnotes } from "@connectors/lib/bot/citations";
import { annotateCitations } from "@connectors/lib/bot/citations";
import { makeConversationUrl } from "@connectors/lib/bot/conversation_utils";
import { DiscordUserOAuthConnectionModel } from "@connectors/lib/models/discord_user_oauth_connection";
import { getActionName } from "@connectors/lib/tools_utils";
import type { Logger } from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import { normalizeError } from "@connectors/types";
import { OAuthAPI } from "@connectors/types/oauth/oauth_api";

const UPDATE_INTERVAL_MS = 2000;

interface DiscordConversationParams {
  agentConfiguration: LightAgentConfigurationType;
  connector: ConnectorResource;
  channelId: string;
  discordUsername: string;
  discordUserId: string;
  message: string;
  interactionToken: string;
  logger: Logger;
}

export async function sendMessageToAgent(
  params: DiscordConversationParams
): Promise<Result<AgentMessageSuccessEvent | undefined, Error>> {
  const {
    agentConfiguration,
    connector,
    channelId,
    discordUsername,
    discordUserId,
    message,
    interactionToken,
    logger,
  } = params;

  const dustAPI = new DustAPI(
    { url: apiConfig.getDustFrontAPIUrl() },
    {
      workspaceId: connector.workspaceId,
      apiKey: connector.workspaceAPIKey,
    },
    logger
  );

  const messageWithMention = `:mention[${agentConfiguration.name}]{sId=${agentConfiguration.sId}} ${message}`;

  const userEmail = await getUserEmail(discordUserId, logger);

  if (!userEmail) {
    // No OAuth connection exists, tell user to run /connect-user-to-dust command
    await sendConnectUserMessage(discordUserId, interactionToken, logger);
    return new Ok(undefined);
  }

  const messageReqBody = {
    content: messageWithMention,
    mentions: [{ configurationId: agentConfiguration.sId }],
    context: {
      timezone: "UTC",
      username: discordUsername,
      fullName: discordUsername,
      email: userEmail,
      profilePictureUrl: null,
    },
  };

  const contentFragmentsRes = await makeDiscordContentFragments({
    channelId,
    logger,
  });

  const contentFragments = contentFragmentsRes.isOk()
    ? contentFragmentsRes.value
    : null;

  const convRes = await dustAPI.createConversation({
    title: null,
    visibility: "unlisted",
    message: messageReqBody,
    contentFragments: contentFragments || undefined,
  });

  if (convRes.isErr()) {
    logger.error(
      { error: convRes.error, connectorId: connector.id },
      "Failed to create conversation"
    );
    await updateDiscordMessage(
      interactionToken,
      `Error: ${convRes.error.message}`,
      logger
    );
    return new Err(new Error("Failed to create conversation"));
  }

  const conversation = convRes.value.conversation;
  const userMessageId = convRes.value.message?.sId;

  if (!userMessageId) {
    logger.error(
      { conversationId: conversation.sId },
      "Failed to retrieve user message ID"
    );
    await updateDiscordMessage(
      interactionToken,
      "Error: Failed to retrieve user message ID",
      logger
    );
    return new Err(new Error("Failed to retrieve user message ID"));
  }

  const streamRes = await streamAgentResponseToDiscord(
    dustAPI,
    conversation,
    userMessageId,
    interactionToken,
    logger,
    connector
  );

  if (streamRes.isErr()) {
    return streamRes;
  }

  try {
    await dustAPI.markAsRead({ conversationId: conversation.sId });
  } catch (error) {
    logger.error(
      { error: normalizeError(error), conversationId: conversation.sId },
      "Failed to mark conversation as read"
    );
  }

  return streamRes;
}

async function streamAgentResponseToDiscord(
  dustAPI: DustAPI,
  conversation: ConversationPublicType,
  userMessageId: string,
  interactionToken: string,
  logger: Logger,
  connector: ConnectorResource
): Promise<Result<AgentMessageSuccessEvent | undefined, Error>> {
  const streamRes = await dustAPI.streamAgentAnswerEvents({
    conversation,
    userMessageId,
  });

  if (streamRes.isErr()) {
    logger.error(
      { error: streamRes.error, conversationId: conversation.sId },
      "Failed to start streaming agent answer"
    );
    await updateDiscordMessage(
      interactionToken,
      `Error: ${streamRes.error.message}`,
      logger
    );
    return new Err(new Error("Failed to stream agent response"));
  }

  let fullContent = "";
  let chainOfThought = "";
  let lastUpdateTime = Date.now();
  const actions: AgentActionPublicType[] = [];

  for await (const event of streamRes.value.eventStream) {
    switch (event.type) {
      case "user_message_error":
      case "agent_error":
      case "tool_error":
        logger.error(
          { error: event.error, conversationId: conversation.sId },
          "Error during agent message streaming"
        );
        await updateDiscordMessage(
          interactionToken,
          `Error: ${event.error.message}`,
          logger
        );
        return new Err(new Error(event.error.message));

      case "agent_message_success": {
        // We currently don't provider use email, so personal credentials are not supported.
        // Catching personal authentication errors to handle gracefully.
        const personalAuthError = actions.find(
          isPersonalAuthenticationActionError
        );

        if (personalAuthError) {
          const conversationUrl = `${apiConfig.getDustFrontAPIUrl()}/w/${connector.workspaceId}/assistant/new`;
          await updateDiscordMessage(
            interactionToken,
            `⚠️ **Personal credentials required**\n\n` +
              `This agent uses tools that require personal authentication. ` +
              `Discord bot doesn't support personal credentials yet.\n\n` +
              `**To use this agent, please start a conversation at:**\n${conversationUrl}\n\n` +
              `You'll be able to authenticate and chat with the agent in your browser.`,
            logger
          );
          return new Ok(undefined);
        }

        fullContent = event.message.content ?? "";
        const { formattedContent, footnotes } = annotateCitations(
          fullContent,
          actions
        );
        const conversationUrl = makeConversationUrl(
          connector.workspaceId,
          conversation.sId
        );
        const footnotesText = formatFootnotes(
          footnotes,
          conversationUrl ?? undefined
        );
        const finalContent = formattedContent + footnotesText;

        await sendDiscordMessages(interactionToken, finalContent, logger);
        return new Ok(event);
      }

      case "generation_tokens": {
        // Stream updates at intervals to avoid rate limits
        if (event.classification === "tokens") {
          fullContent += event.text;
        } else if (event.classification === "chain_of_thought") {
          if (event.text === "\n\n") {
            chainOfThought = "";
          } else {
            chainOfThought += event.text;
          }
        }

        const now = Date.now();
        if (now - lastUpdateTime > UPDATE_INTERVAL_MS) {
          lastUpdateTime = now;
          // Show chain of thought if available, otherwise show content
          const text = chainOfThought || fullContent;
          if (text.trim()) {
            const { formattedContent, footnotes } = annotateCitations(
              text,
              actions
            );
            // Don't include conversation URL in preview updates (only in final).
            const footnotesText = formatFootnotes(footnotes);
            const previewContent = formattedContent + footnotesText;

            await updateDiscordMessage(
              interactionToken,
              previewContent,
              logger
            );
          }
        }
        break;
      }

      case "tool_params": {
        const actionName = getActionName(event.action);
        await updateDiscordMessage(
          interactionToken,
          `🔧 **${actionName}...**`,
          logger
        );
        break;
      }

      case "agent_action_success":
        actions.push(event.action);
        logger.info(
          {
            conversationId: conversation.sId,
          },
          "Agent action completed"
        );
        break;
    }
  }

  return new Ok(undefined);
}

/**
 * Split content into chunks that fit within Discord's 2000 character limit.
 */
function splitContentForDiscord(content: string): string[] {
  const MAX_LENGTH = 2000;

  if (content.length <= MAX_LENGTH) {
    return [content];
  }

  const chunks: string[] = [];
  let currentChunk = "";

  // Split by lines to avoid breaking in the middle of a line.
  const lines = content.split("\n");

  for (const line of lines) {
    // If a single line is longer than max, we need to split it.
    if (line.length > MAX_LENGTH) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = "";
      }

      // Split the long line into smaller chunks.
      let remainingLine = line;
      while (remainingLine.length > 0) {
        chunks.push(remainingLine.substring(0, MAX_LENGTH));
        remainingLine = remainingLine.substring(MAX_LENGTH);
      }
      continue;
    }

    // Check if adding this line would exceed the limit.
    if (currentChunk.length + line.length + 1 > MAX_LENGTH) {
      chunks.push(currentChunk);
      currentChunk = line;
    } else {
      currentChunk += (currentChunk ? "\n" : "") + line;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

export async function sendDiscordMessages(
  interactionToken: string,
  content: string,
  logger: Logger
): Promise<void> {
  const chunks = splitContentForDiscord(content);

  const [firstChunk, ...remainingChunks] = chunks;
  if (!firstChunk) {
    return;
  }

  await updateDiscordMessage(interactionToken, firstChunk, logger);

  if (remainingChunks.length > 0) {
    logger.info(
      { totalChunks: chunks.length },
      "Message split into multiple Discord messages"
    );

    for (const chunk of remainingChunks) {
      await sendDiscordFollowUpMessage(interactionToken, chunk, logger);
    }
  }
}

async function sendDiscordFollowUpMessage(
  interactionToken: string,
  content: string,
  logger: Logger
): Promise<void> {
  const applicationId = apiConfig.getDiscordApplicationId();
  const url = `${DISCORD_API_BASE_URL}/webhooks/${applicationId}/${interactionToken}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      },
      "Failed to send Discord follow-up message"
    );
  }
}

async function updateDiscordMessage(
  interactionToken: string,
  content: string,
  logger: Logger
): Promise<void> {
  const applicationId = apiConfig.getDiscordApplicationId();

  const url = `${DISCORD_API_BASE_URL}/webhooks/${applicationId}/${interactionToken}/messages/@original`;

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: content,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      },
      "Failed to update Discord message"
    );
  }
}

function formatFootnotes(
  footnotes: MessageFootnotes,
  conversationUrl?: string
): string {
  const sections: string[] = [];

  if (footnotes.length > 0) {
    const limitedFootnotes = footnotes.slice(0, 5);
    const footnotesText = limitedFootnotes
      .map((f) => `[${f.index}] ${f.text}: ${f.link}`)
      .join("\n");
    sections.push(`**Sources:**\n${footnotesText}`);
  }

  if (conversationUrl) {
    sections.push(`[View full conversation](${conversationUrl})`);
  }

  return sections.length > 0 ? `\n\n${sections.join("\n\n")}` : "";
}

function isPersonalAuthenticationActionError(
  action: AgentActionPublicType
): boolean {
  if (action.status !== "errored" || !action.output) {
    return false;
  }
  const outputText = action.output
    .map((o) => (o.type === "text" ? o.text : ""))
    .join(" ");
  return (
    outputText.includes("Personal tools require") ||
    outputText.includes("require the user to be authenticated")
  );
}

async function getUserEmail(
  discordUserId: string,
  logger: Logger
): Promise<string | null> {
  const userConnection = await DiscordUserOAuthConnectionModel.findOne({
    where: { discordUserId },
  });
  if (!userConnection) {
    return null;
  }

  const oauthConfig = apiConfig.getOAuthAPIConfig();
  const oauthAPI = new OAuthAPI(oauthConfig, logger);

  const tokenResult = await oauthAPI.getAccessToken({
    provider: "discord",
    connectionId: userConnection.connectionId,
  });

  if (tokenResult.isErr()) {
    logger.error(
      {
        discordUserId,
        connectionId: userConnection.connectionId,
        error: tokenResult.error,
      },
      "Failed to get OAuth access token for Discord user"
    );
    throw normalizeError(tokenResult.error);
  }

  const userResponse = await fetch(`${DISCORD_API_BASE_URL}/users/@me`, {
    headers: {
      Authorization: `Bearer ${tokenResult.value.access_token}`,
    },
  });

  if (!userResponse.ok) {
    logger.error(
      {
        discordUserId,
        connectionId: userConnection.connectionId,
        status: userResponse.status,
      },
      "Failed to fetch Discord user data with OAuth token"
    );
    throw normalizeError(
      `Failed to fetch Discord user data: ${userResponse.status}`
    );
  }

  const userData = await userResponse.json();
  const userEmail = userData.email;

  if (!userEmail) {
    logger.error(
      { discordUserId, connectionId: userConnection.connectionId },
      "No email found in Discord user data"
    );
    throw normalizeError("No email found in Discord user data");
  }

  return userEmail;
}

async function sendConnectUserMessage(
  discordUserId: string,
  interactionToken: string,
  logger: Logger
): Promise<void> {
  const message =
    `🔐 **Connect Your Discord Account**\n\n` +
    `To use this agent, please run the \`/connect-user-to-dust\` command to connect your Discord account.\n\n` +
    `After connecting, you'll be able to use the \`/ask-dust-agent\` command.`;

  await sendDiscordMessages(interactionToken, message, logger);
}
