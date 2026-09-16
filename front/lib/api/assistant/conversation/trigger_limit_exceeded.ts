import {
  getConversationRankVersionLock,
  getNextConversationMessageRank,
} from "@app/lib/api/assistant/conversation/lock";
import {
  createAgentMessages,
  createUserMessage,
  resolveModelForMentionedAgent,
} from "@app/lib/api/assistant/conversation/messages";
import type { Authenticator } from "@app/lib/auth";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type {
  ConversationWithoutContentType,
  UserMessageContext,
} from "@app/types/assistant/conversation";
import type { APIErrorType } from "@app/types/error";

const CREDITS_EXHAUSTED_ERROR_TITLE = "Workspace out of credits";

const LIMIT_ERROR_TITLES: Partial<Record<APIErrorType, string>> = {
  credits_exhausted: CREDITS_EXHAUSTED_ERROR_TITLE,
  user_cap_reached: "Personal usage cap reached",
  plan_message_limit_exceeded: "Plan message limit exceeded",
  rate_limit_error: "Rate limit exceeded",
  no_seat: "No seat available",
};

/**
 * Creates a user + agent message pair for a trigger that could not start because
 * of a workspace/user limit (credits, caps, seats, …), with the agent message
 * already marked failed. Does not launch the agent loop.
 *
 * Used when `postUserMessage` fails the limit check after the conversation row
 * has already been created, so opening the conversation surfaces the error
 * instead of a blank page.
 */
export async function createTriggerLimitExceededMessages(
  auth: Authenticator,
  {
    conversation,
    agentConfiguration,
    content,
    context,
    error,
  }: {
    conversation: ConversationWithoutContentType;
    agentConfiguration: LightAgentConfigurationType;
    content: string;
    context: UserMessageContext;
    error: { type: APIErrorType; message: string };
  }
): Promise<void> {
  const user = auth.user();
  const owner = auth.getNonNullableWorkspace();

  await ConversationResource.upsertParticipation(auth, {
    conversation,
    action: "posted",
    user: user?.toJSON() ?? null,
  });

  const modelResolution = await resolveModelForMentionedAgent(auth, {
    configuration: agentConfiguration,
  });

  const enrichedContext: UserMessageContext = {
    ...context,
    apiKeyId: auth.keyForUsageAttribution()?.id ?? null,
    authMethod: auth.authMethod(),
  };

  await withTransaction(async (t) => {
    await getConversationRankVersionLock(auth, conversation, t);

    let nextMessageRank = await getNextConversationMessageRank(auth, {
      conversation,
      transaction: t,
    });

    const userMessageWithoutMentions = await createUserMessage(auth, {
      conversation,
      content,
      metadata: {
        type: "create",
        user: user?.toJSON() ?? null,
        rank: nextMessageRank++,
        context: enrichedContext,
        requestedModel: null,
      },
      transaction: t,
    });

    const { agentMessages } = await createAgentMessages(auth, {
      conversation,
      metadata: {
        type: "create",
        agentConfiguration,
        skipToolsValidation: false,
        nextMessageRank,
        userMessage: userMessageWithoutMentions,
        modelResolution,
        isRestrictedBySpaceUsage: false,
      },
      transaction: t,
    });

    const errorMetadata: Record<string, string> = {
      errorTitle:
        LIMIT_ERROR_TITLES[error.type] ?? "Unable to start triggered agent",
    };
    if (error.type === "credits_exhausted") {
      errorMetadata.category = "credits_exhausted";
    }

    const completedAt = new Date();
    for (const agentMessage of agentMessages) {
      await AgentMessageModel.update(
        {
          status: "failed",
          completedAt,
          errorCode: error.type,
          errorMessage: error.message,
          errorMetadata,
        },
        {
          where: {
            id: agentMessage.agentMessageId,
            workspaceId: owner.id,
            status: "created",
          },
          transaction: t,
        }
      );
    }

    await ConversationResource.markAsUpdated(auth, { conversation, t });
    await ConversationResource.markHasError(auth, { conversation }, t);
    await ConversationResource.markAsReadForAuthUser(auth, {
      conversation,
      transaction: t,
    });
  });

  if (!conversation.title) {
    await ConversationResource.updateTitle(
      auth,
      conversation.sId,
      agentConfiguration.name
    );
  }
}
