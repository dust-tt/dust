/**
 * Run agent arguments
 */
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { cacheWithRedis } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type {
  AgentMessageType,
  ConversationType,
  UserMessageOrigin,
  UserMessageType,
} from "@app/types/assistant/conversation";
import {
  isAgentMessageType,
  isUserMessageType,
} from "@app/types/assistant/conversation";

import type { Result } from "../shared/result";
import { Err, Ok } from "../shared/result";
import { isGlobalAgentId } from "./assistant";
import { ConversationError } from "./conversation";

/**
 * Error types for getAgentLoopData that indicate soft-deleted resources.
 * These are safe to ignore in callers since the resource was intentionally deleted.
 */
export const AGENT_LOOP_DATA_SOFT_DELETE_ERROR_TYPES = [
  "conversation_deleted",
  "agent_message_deleted",
  "user_message_deleted",
] as const;

export type AgentLoopDataSoftDeleteErrorType =
  (typeof AGENT_LOOP_DATA_SOFT_DELETE_ERROR_TYPES)[number];

export class AgentLoopDataError extends Error {
  readonly type: AgentLoopDataSoftDeleteErrorType;

  constructor(type: AgentLoopDataSoftDeleteErrorType) {
    super(`Agent loop data unavailable: ${type}`);
    this.type = type;
  }
}

export function isAgentLoopDataSoftDeleteError(
  error: Error
): error is AgentLoopDataError {
  return (
    error instanceof AgentLoopDataError &&
    AGENT_LOOP_DATA_SOFT_DELETE_ERROR_TYPES.includes(error.type)
  );
}

export type ConversationCaching =
  | { useCachedGetConversation: false }
  | { useCachedGetConversation: true; unicitySuffix: string; ttlMs: number };

// Throws on error because cacheWithRedis expects functions that throw (not Result types).
// Errors are caught and converted back to Result in getAgentLoopData.
async function getConversationForAgentLoop(
  auth: Authenticator,
  conversationId: string,
  // These params are only used for cache key uniqueness.
  _workspaceId: string,
  _unicitySuffix: string
): Promise<ConversationType> {
  const res = await getConversation(auth, conversationId);
  if (res.isErr()) {
    throw res.error;
  }
  return res.value;
}

function getCachedGetConversation(ttlMs: number) {
  return cacheWithRedis(
    getConversationForAgentLoop,
    (_auth, conversationId, workspaceId, unicitySuffix) =>
      `${workspaceId}:${conversationId}:${unicitySuffix}`,
    {
      ttlMs,
      useDistributedLock: true,
    }
  );
}

export type AgentLoopArgs = {
  agentMessageId: string;
  agentMessageVersion: number;
  conversationId: string;
  conversationTitle: string | null;

  // Note that the original user message may not be the same as the parent message as agent might mention other agents.
  userMessageId: string;
  userMessageVersion: number;
  userMessageOrigin?: UserMessageOrigin | null;

  caching?: ConversationCaching;
};

export type AgentMessageRef = {
  agentMessageId: string;
  conversationId: string;
};

export type AgentLoopExecutionData = {
  agentConfiguration: AgentConfigurationType;
  agentMessage: AgentMessageType;
  agentMessageRow: AgentMessageModel;
  conversation: ConversationType;
  userMessage: UserMessageType;
};

export type AgentLoopArgsWithTiming = AgentLoopArgs & {
  initialStartTime: number;
};

export async function getAgentLoopData(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<
  Result<
    AgentLoopExecutionData & { auth: Authenticator },
    AgentLoopDataError | Error
  >
> {
  let authResult = await Authenticator.fromJSON(authType);

  // If subscription changed while the message was running, get a fresh auth with the current
  // subscription and continue gracefully.
  if (authResult.isErr() && authResult.error.code === "subscription_mismatch") {
    logger.info(
      {
        workspaceId: authType.workspaceId,
        originalSubscriptionId: authType.subscriptionId,
      },
      "Subscription changed while message was running, using fresh auth"
    );

    // Retry without the subscriptionId constraint to get the current subscription.
    authResult = await Authenticator.fromJSON({
      ...authType,
      subscriptionId: null,
    });
  }

  if (authResult.isErr()) {
    return new Err(
      new Error(`Failed to deserialize authenticator: ${authResult.error.code}`)
    );
  }
  const auth = authResult.value;

  const {
    agentMessageId,
    agentMessageVersion,
    caching,
    conversationId,
    userMessageId,
    userMessageVersion,
  } = agentLoopArgs;

  let conversation: ConversationType;
  if (caching?.useCachedGetConversation) {
    try {
      const cachedGetConversation = getCachedGetConversation(caching.ttlMs);
      conversation = await cachedGetConversation(
        auth,
        conversationId,
        auth.getNonNullableWorkspace().sId,
        caching.unicitySuffix
      );
    } catch (error) {
      if (
        error instanceof ConversationError &&
        error.type === "conversation_not_found"
      ) {
        // Check if the conversation was soft-deleted.
        const conv = await ConversationResource.fetchById(
          auth,
          conversationId,
          { includeDeleted: true }
        );
        if (conv?.visibility === "deleted") {
          return new Err(new AgentLoopDataError("conversation_deleted"));
        }
      }
      if (error instanceof ConversationError) {
        return new Err(error);
      }
      throw error;
    }
  } else {
    const conversationRes = await getConversation(auth, conversationId);
    if (conversationRes.isErr()) {
      if (conversationRes.error.type === "conversation_not_found") {
        // Check if the conversation was soft-deleted.
        const conv = await ConversationResource.fetchById(
          auth,
          conversationId,
          { includeDeleted: true }
        );
        if (conv?.visibility === "deleted") {
          return new Err(new AgentLoopDataError("conversation_deleted"));
        }
      }
      return conversationRes;
    }
    conversation = conversationRes.value;
  }

  // Find the agent message by searching all groups in reverse order. Retried messages do not have
  // the same sId as the original message, so we need to search all groups.
  let agentMessage: AgentMessageType | undefined;
  for (let i = conversation.content.length - 1; i >= 0 && !agentMessage; i--) {
    const messageGroup = conversation.content[i];
    for (const msg of messageGroup) {
      if (
        isAgentMessageType(msg) &&
        msg.sId === agentMessageId &&
        msg.version === agentMessageVersion
      ) {
        agentMessage = msg;
        break;
      }
    }
  }

  if (!agentMessage) {
    return new Err(new Error("Agent message not found"));
  }

  // Check if the agent message was soft-deleted.
  if (agentMessage.visibility === "deleted") {
    return new Err(new AgentLoopDataError("agent_message_deleted"));
  }

  // Find the user message group by searching in reverse order.
  const userMessageGroup = conversation.content.findLast((messageGroup) =>
    messageGroup.some((m) => m.sId === userMessageId)
  );

  // We assume that the message group is ordered by version ASC. Message version starts from 0.
  const userMessage = userMessageGroup?.[userMessageVersion];

  if (
    !userMessage ||
    !isUserMessageType(userMessage) ||
    userMessage.sId !== userMessageId ||
    userMessage.version !== userMessageVersion
  ) {
    return new Err(new Error("Unexpected: User message not found"));
  }

  // Check if the user message was soft-deleted.
  if (userMessage.visibility === "deleted") {
    return new Err(new AgentLoopDataError("user_message_deleted"));
  }

  // Get the AgentMessage database row by querying through Message model.
  const agentMessageRow = await MessageModel.findOne({
    where: {
      // Leveraging the index on workspaceId, conversationId, sId.
      conversationId: conversation.id,
      sId: agentMessageId,
      workspaceId: auth.getNonNullableWorkspace().id,
      // No proper index on version.
      version: agentMessageVersion,
    },
    include: [
      {
        model: AgentMessageModel,
        as: "agentMessage",
        required: true,
      },
    ],
  });

  if (!agentMessageRow?.agentMessage) {
    return new Err(new Error("Agent message database row not found"));
  }

  // Fetch the agent configuration as we need the full version of the agent configuration.
  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: agentMessage.configuration.sId,
    // We do define agentMessage.configuration.version for global agent, ignoring this value here.
    agentVersion: isGlobalAgentId(agentMessage.configuration.sId)
      ? undefined
      : agentMessage.configuration.version,
    variant: "full",
  });
  if (!agentConfiguration) {
    return new Err(new Error("Agent configuration not found"));
  }

  return new Ok({
    agentConfiguration,
    agentMessage,
    agentMessageRow: agentMessageRow.agentMessage,
    auth,
    conversation,
    userMessage,
  });
}
