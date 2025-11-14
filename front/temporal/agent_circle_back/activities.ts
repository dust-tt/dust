import { postUserMessage } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { Authenticator } from "@app/lib/auth";
import { parseMentions } from "@app/lib/mentions/format";
import type { MentionType } from "@app/types";
import logger from "@app/logger/logger";

export async function postCircleBackMessageActivity(
  workspaceId: string,
  conversationId: string,
  agentConfigurationId: string,
  userId: string,
  message: string
): Promise<void> {
  const loggerArgs = {
    workspaceId,
    conversationId,
    message: message.substring(0, 50),
  };

  logger.info(loggerArgs, "[CircleBack] Posting circle back message.");

  // Create authenticator - either for the specific user or as internal
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    userId,
    workspaceId
  );

  // Fetch the conversation with full content
  const conversationResult = await getConversation(auth, conversationId);

  if (conversationResult.isErr()) {
    logger.warn(
      {
        ...loggerArgs,
        error: conversationResult.error,
      },
      "[CircleBack] Conversation not found - silently failing as expected."
    );
    // Fail silently as per the plan - conversation may have been deleted
    return;
  }

  const conversation = conversationResult.value;

  // Parse agent mentions from the message content
  const parsedMentions = parseMentions(message);
  const mentions: MentionType[] = parsedMentions
    .filter((m) => m.type === "agent")
    .map((m) => ({ configurationId: m.sId }));

  // Add the agent that scheduled the circle back to mentions if not already present
  mentions.push({ configurationId: agentConfigurationId });

  // Get user info from auth
  const user = auth.user();

  // Post the message back to the conversation
  const result = await postUserMessage(auth, {
    conversation,
    content: message,
    mentions,
    context: {
      username: user?.username || "Circle Back",
      timezone: "UTC",
      profilePictureUrl: user?.imageUrl || null,
      fullName: user?.fullName() || null,
      email: user?.email || null,
      origin: "agent_circle_back",
    },
    skipToolsValidation: false,
  });

  if (result.isErr()) {
    const error = result.error;
    logger.error(
      {
        ...loggerArgs,
        error: error.api_error,
        status_code: error.status_code,
      },
      "[CircleBack] Failed to post circle back message."
    );

    throw new Error(
      `Failed to post circle back message: ${error.api_error.type} - ${error.api_error.message}`
    );
  }

  logger.info(
    {
      ...loggerArgs,
      userMessageSId: result.value.userMessage.sId,
      agentMessageCount: result.value.agentMessages.length,
    },
    "[CircleBack] Successfully posted circle back message."
  );
}
