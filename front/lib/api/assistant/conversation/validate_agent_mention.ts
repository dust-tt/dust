import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getRelatedContentFragments } from "@app/lib/api/assistant/content_fragments";
import {
  applyFairUseDecision,
  checkMessagesLimit,
} from "@app/lib/api/assistant/conversation";
import { runAgentLoopWorkflow } from "@app/lib/api/assistant/conversation/agent_loop";
import { canCurrentUserRespondToParentUserMessage } from "@app/lib/api/assistant/conversation/can_current_user_respond";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import {
  getConversationRankVersionLock,
  getNextConversationMessageRank,
} from "@app/lib/api/assistant/conversation/lock";
import {
  createAgentMessages,
  resolveModelForMentionedAgent,
} from "@app/lib/api/assistant/conversation/messages";
import { applyPremiumModelFairUse } from "@app/lib/api/assistant/premium_model_limit";
import { publishMessageEventsOnMessagePostOrEdit } from "@app/lib/api/assistant/streaming/events";
import type { Authenticator } from "@app/lib/auth";
import { MentionModel } from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { auditLog } from "@app/logger/logger";
import type {
  AgentMessageType,
  RichMentionWithStatus,
  UserMessageType,
} from "@app/types/assistant/conversation";
import { isUserMessageType } from "@app/types/assistant/conversation";
import {
  isRichAgentMention,
  toMentionType,
} from "@app/types/assistant/mentions";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Approve or reject a restricted agent mention in a Pod conversation.
 * On approve: creates the agent message in the conversation and launches the agent loop
 * (intentional override of canAgentBeUsedInProjectConversation).
 *
 * Lives in its own module to avoid an import cycle with conversation.ts
 * (which imports createUserMentions from mentions.ts).
 */
export async function validateAgentMention(
  auth: Authenticator,
  {
    conversationId,
    agentConfigurationId,
    messageId,
    approvalState,
  }: {
    conversationId: string;
    agentConfigurationId: string;
    messageId: string;
    approvalState: "approved" | "rejected";
  }
): Promise<Result<void, APIErrorWithContentfulStatusCode>> {
  // biome-ignore lint/plugin/noExpensiveConversationFetch: intentional full conversation load
  const conversationRes = await getConversation(auth, conversationId);
  if (conversationRes.isErr()) {
    return new Err({
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found",
      },
    });
  }

  const conversation = conversationRes.value;
  const isApproval = approvalState === "approved";

  const message = conversation.content.flat().find((m) => m.sId === messageId);
  if (!message) {
    return new Err({
      status_code: 404,
      api_error: {
        type: "message_not_found",
        message: "Message not found",
      },
    });
  }

  if (!isUserMessageType(message)) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Restricted agent mentions can only be on user messages",
      },
    });
  }

  if (
    !canCurrentUserRespondToParentUserMessage({
      parentUserId: message.user?.id,
      currentUserId: auth.getNonNullableUser().id,
    })
  ) {
    return new Err({
      status_code: 403,
      api_error: {
        type: "invalid_request_error",
        message: "User is not authorized to edit this mention",
      },
    });
  }

  const restrictedMention = message.richMentions.find(
    (m) =>
      isRichAgentMention(m) &&
      m.id === agentConfigurationId &&
      m.status === "agent_restricted_by_space_usage" &&
      !m.dismissed
  );
  if (!restrictedMention) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "No restricted agent mention found to validate",
      },
    });
  }

  if (!isApproval) {
    const mentionModels = await MentionModel.findAll({
      where: {
        workspaceId: conversation.owner.id,
        messageId: message.id,
        agentConfigurationId,
        status: "agent_restricted_by_space_usage",
      },
    });
    if (mentionModels.length === 0) {
      return new Err({
        status_code: 404,
        api_error: {
          type: "invalid_request_error",
          message: "Mention not found",
        },
      });
    }
    // Instance updates avoid Sequelize bulk-update validation that requires
    // userId/agentConfigurationId on the partial payload.
    await Promise.all(
      mentionModels.map((m) => m.update({ status: "rejected" }))
    );

    const newRichMentions = message.richMentions.map((m) =>
      isRichAgentMention(m) &&
      m.id === agentConfigurationId &&
      m.status === "agent_restricted_by_space_usage"
        ? { ...m, status: "rejected" as const }
        : m
    );
    // Collapse duplicate rejected entries for this agent into one.
    const seenRejectedAgent = new Set<string>();
    const collapsedRichMentions = newRichMentions.filter((m) => {
      if (
        isRichAgentMention(m) &&
        m.id === agentConfigurationId &&
        m.status === "rejected"
      ) {
        if (seenRejectedAgent.has(m.id)) {
          return false;
        }
        seenRejectedAgent.add(m.id);
      }
      return true;
    });
    const updatedUserMessage: UserMessageType = {
      ...message,
      richMentions: collapsedRichMentions,
      mentions: collapsedRichMentions.map(toMentionType),
    };

    await publishMessageEventsOnMessagePostOrEdit(
      conversation,
      {
        ...updatedUserMessage,
        contentFragments: getRelatedContentFragments(
          conversation,
          updatedUserMessage
        ),
      },
      []
    );

    return new Ok(undefined);
  }

  const configuration = await getAgentConfiguration(auth, {
    agentId: agentConfigurationId,
    variant: "light",
  });
  if (
    !configuration ||
    !(
      (configuration.status === "active" || configuration.status === "draft") &&
      configuration.canRead
    )
  ) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "agent_inaccessible",
        message:
          "This agent is either disabled or you don't have access to it.",
      },
    });
  }

  const limitResult = await checkMessagesLimit(auth, {
    mentions: [{ configurationId: agentConfigurationId }],
    context: message.context,
  });
  if (limitResult.isErr()) {
    return limitResult;
  }

  auditLog(
    {
      author: auth.getNonNullableUser().toJSON(),
      workspaceId: conversation.owner.sId,
      conversationId: conversation.sId,
      messageId: message.sId,
      agentConfigurationId,
      approvalState,
    },
    "User approved a restricted agent mention"
  );

  let modelResolution = await resolveModelForMentionedAgent(auth, {
    configuration,
    selection: message.requestedModel ?? undefined,
  });

  const decision = await applyPremiumModelFairUse(auth, {
    user: auth.getNonNullableUser(),
    resolution: modelResolution,
    context: message.context,
  });
  const premiumModelLimitResult = applyFairUseDecision(decision);
  if (premiumModelLimitResult.isErr()) {
    return premiumModelLimitResult;
  }
  modelResolution = premiumModelLimitResult.value ?? modelResolution;

  let agentMessages: AgentMessageType[];
  let updatedRichMentions: RichMentionWithStatus[];

  try {
    const created = await withTransaction(async (t) => {
      await getConversationRankVersionLock(auth, conversation, t);

      const mentionModels = await MentionModel.findAll({
        where: {
          workspaceId: conversation.owner.id,
          messageId: message.id,
          agentConfigurationId,
          status: "agent_restricted_by_space_usage",
        },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (mentionModels.length === 0) {
        throw new Error("Restricted agent mention not found");
      }

      const [primaryMention, ...duplicateMentions] = mentionModels;

      const nextMessageRank = await getNextConversationMessageRank(auth, {
        conversation,
        transaction: t,
      });

      const { agentMessages, richMentions } = await createAgentMessages(auth, {
        conversation,
        metadata: {
          type: "approve_existing_mention",
          mentionRow: primaryMention,
          configuration,
          skipToolsValidation: false,
          nextMessageRank,
          userMessage: message,
          modelResolution,
        },
        transaction: t,
      });

      // Clear any duplicate restricted rows for the same agent on this message
      // so the UI does not keep a ghost pending card after approval.
      if (duplicateMentions.length > 0) {
        // Instance updates avoid Sequelize bulk-update validation that requires
        // userId/agentConfigurationId on the partial payload.
        await Promise.all(
          duplicateMentions.map((m) =>
            m.update({ status: "approved" }, { transaction: t })
          )
        );
      }

      await ConversationResource.markAsUpdated(auth, { conversation, t });

      const approvedRichMention =
        richMentions[0] ??
        ({
          ...restrictedMention,
          status: "approved" as const,
        } satisfies RichMentionWithStatus);

      // Collapse duplicate rich mentions for this agent into a single approved entry.
      const otherMentions = message.richMentions.filter(
        (m) => !(isRichAgentMention(m) && m.id === agentConfigurationId)
      );
      const updatedRichMentions = [...otherMentions, approvedRichMention];

      return { agentMessages, updatedRichMentions };
    });
    agentMessages = created.agentMessages;
    updatedRichMentions = created.updatedRichMentions;
  } catch (e) {
    if (
      e instanceof Error &&
      e.message === "Restricted agent mention not found"
    ) {
      return new Err({
        status_code: 404,
        api_error: {
          type: "invalid_request_error",
          message: "Mention not found",
        },
      });
    }
    throw e;
  }

  if (agentMessages.length === 0) {
    return new Err({
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to create agent message for approved mention",
      },
    });
  }

  await runAgentLoopWorkflow({
    auth,
    agentMessages,
    conversation,
    userMessage: message,
  });

  const updatedUserMessage: UserMessageType = {
    ...message,
    richMentions: updatedRichMentions,
    mentions: updatedRichMentions.map(toMentionType),
  };

  await publishMessageEventsOnMessagePostOrEdit(
    conversation,
    {
      ...updatedUserMessage,
      contentFragments: getRelatedContentFragments(
        conversation,
        updatedUserMessage
      ),
    },
    agentMessages
  );

  return new Ok(undefined);
}
