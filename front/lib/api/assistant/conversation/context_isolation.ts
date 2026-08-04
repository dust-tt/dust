import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import type {
  AgenticMessageData,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import type { ConversationContextMode } from "@app/types/assistant/conversation_context_mode";
import { normalizeConversationContextMode } from "@app/types/assistant/conversation_context_mode";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

/**
 * The immutable execution-authority snapshot written on every `AgentMessageModel` created for a
 * post. `contextIsolationRootRank` is the rank of the user message that opens the isolation
 * window; the agent loop renders nothing that precedes it.
 */
export type AgentRunContextIsolation = {
  conversationContextMode: ConversationContextMode;
  contextIsolationRootRank: number | null;
};

export const FULL_CONTEXT_ISOLATION: AgentRunContextIsolation = {
  conversationContextMode: "full",
  contextIsolationRootRank: null,
};

/**
 * Isolation snapshot for a run started directly by a user message: the message itself is the
 * isolation root.
 */
export function contextIsolationForUserMessage({
  conversationContextMode,
  userMessageRank,
}: {
  conversationContextMode: ConversationContextMode;
  userMessageRank: number;
}): AgentRunContextIsolation {
  if (conversationContextMode === "full") {
    return FULL_CONTEXT_ISOLATION;
  }

  return {
    conversationContextMode: "isolated",
    contextIsolationRootRank: userMessageRank,
  };
}

/**
 * Isolation snapshot for a nested run (`run_agent` / `agent_handover`), derived server-side from
 * the canonical parent agent-message row — never from the child request body, its origin, its text
 * or any UI state.
 *
 * A same-conversation handover inherits the parent's isolation root verbatim: the handed-over
 * agent keeps the parent run's post-boundary state but can never reach messages that predate the
 * boundary. A `run_agent` child posts into a different conversation (a freshly created one, or an
 * explicitly targeted one), where the parent's root rank has no meaning, so it starts at "full" —
 * a brand-new child conversation has no history to inherit in the first place.
 */
export async function resolveInheritedContextIsolation(
  auth: Authenticator,
  {
    agenticMessageData,
    conversation,
    transaction,
  }: {
    agenticMessageData: AgenticMessageData | undefined;
    conversation: ConversationWithoutContentType;
    transaction?: Transaction;
  }
): Promise<AgentRunContextIsolation> {
  if (agenticMessageData?.type !== "agent_handover") {
    return FULL_CONTEXT_ISOLATION;
  }

  const originMessage = await MessageModel.findOne({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      // Scoping to the current conversation is what makes the inherited root rank meaningful: ranks
      // are conversation-scoped ordinals.
      conversationId: conversation.id,
      sId: agenticMessageData.originMessageId,
      agentMessageId: { [Op.not]: null },
    },
    include: [
      {
        model: AgentMessageModel,
        as: "agentMessage",
        required: true,
      },
    ],
    transaction,
  });

  if (!originMessage?.agentMessage) {
    return FULL_CONTEXT_ISOLATION;
  }

  const { agentMessage } = originMessage;
  const conversationContextMode = normalizeConversationContextMode(
    agentMessage.conversationContextMode
  );

  if (
    conversationContextMode === "full" ||
    agentMessage.contextIsolationRootRank === null
  ) {
    return FULL_CONTEXT_ISOLATION;
  }

  return {
    conversationContextMode: "isolated",
    contextIsolationRootRank: agentMessage.contextIsolationRootRank,
  };
}
