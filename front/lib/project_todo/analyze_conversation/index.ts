import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { getFastestWhitelistedModel } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { MessageModel } from "@app/lib/models/agent/conversation";
import {
  buildActionItems,
  buildPromptActionItems,
} from "@app/lib/project_todo/analyze_conversation/action_items";
import {
  buildKeyDecisions,
  buildPromptKeyDecisions,
} from "@app/lib/project_todo/analyze_conversation/key_decisions";
import {
  buildNotableFacts,
  buildPromptNotableFacts,
} from "@app/lib/project_todo/analyze_conversation/notable_facts";
import {
  ExtractActionItemsResult,
  type ExtractionResult,
} from "@app/lib/project_todo/analyze_conversation/types";
import {
  buildSpec,
  renderConversationForLLM,
} from "@app/lib/project_todo/analyze_conversation/utils";
import { TakeawaysResource } from "@app/lib/resources/takeaways_resource";
import logger from "@app/logger/logger";
import type {
  ConversationType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import type { ModelConversationTypeMultiActions } from "@app/types/assistant/generation";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import { startActiveObservation } from "@langfuse/tracing";

export type ConversationParticipant = {
  sId: string;
  fullName: string;
};

// Extracts a deduplicated list of human participants from the conversation
// content. Only user messages with an authenticated user (non-null .user) are
// included, since programmatic senders lack a stable sId.
export function getConversationParticipants(
  conversation: ConversationType
): ConversationParticipant[] {
  const seen = new Map<string, string>();
  for (const group of conversation.content) {
    for (const message of group) {
      if (message.type === "user_message") {
        const userMsg = message as UserMessageType;
        if (userMsg.user && !seen.has(userMsg.user.sId)) {
          seen.set(userMsg.user.sId, userMsg.user.fullName);
        }
      }
    }
  }
  return Array.from(seen.entries()).map(([sId, fullName]) => ({
    sId,
    fullName,
  }));
}

function buildParticipantRoster(
  participants: ConversationParticipant[]
): string {
  if (participants.length === 0) {
    return "";
  }
  const lines = participants.map(
    (p) => `- id: "${p.sId}" | name: "${p.fullName}"`
  );
  return (
    "Conversation participants (human users only):\n" +
    lines.join("\n") +
    "\n\n"
  );
}

const AGENTIC_CONTEXT_PREAMBLE =
  "IMPORTANT CONTEXT: This is a conversation between human users and a Dust AI assistant.\n" +
  "Messages from the assistant are AI-generated responses, NOT from a human participant.\n" +
  "- Do NOT treat user questions that the AI assistant already answered as open action items.\n" +
  "- Only extract action items that represent real commitments between human participants, " +
  "or tasks that a human explicitly stated they need to do outside the conversation.\n" +
  "- A user asking the AI assistant to do something (e.g., 'can you check X?', 'please look into Y') " +
  "is NOT an action item — it is a query being handled in real-time by the assistant.\n" +
  "- Assignees and relevant users must always be human participants, never the AI assistant.\n\n";

// Calls the LLM with a forced extract_action_items tool call and parses the result.
// Returns null if the call fails, produces no tool call, or the output fails parsing.
async function callExtractActionItemsLLM(
  auth: Authenticator,
  {
    conv,
    model,
    specification,
    prompt,
    conversation,
  }: {
    conv: ModelConversationTypeMultiActions;
    model: ModelConfigurationType;
    specification: AgentActionSpecification;
    prompt: string;
    conversation: ConversationType;
  }
): Promise<ExtractionResult | null> {
  const owner = auth.getNonNullableWorkspace();
  const res = await startActiveObservation(
    "project-todo-analyze-conversation",
    () =>
      runMultiActionsAgent(
        auth,
        {
          providerId: model.providerId,
          modelId: model.modelId,
          functionCall: specification.name,
          useCache: false,
        },
        {
          conversation: conv,
          prompt,
          specifications: [specification],
          forceToolCall: specification.name,
        },
        {
          context: {
            operationType: "project_todo_analyze_conversation",
            conversationId: conversation.sId,
            workspaceId: owner.sId,
          },
        }
      )
  );
  if (res.isErr()) {
    logger.error(
      { conversationId: conversation.id, error: res.error },
      "Conversation todo: LLM call failed"
    );
    return null;
  }

  const action = res.value.actions?.[0];
  if (!action?.arguments) {
    logger.warn(
      { conversationId: conversation.id },
      "Conversation todo: no tool call in LLM response"
    );
    return null;
  }

  const parsed = ExtractActionItemsResult.safeParse(action.arguments);
  if (!parsed.success) {
    logger.warn(
      { conversationId: conversation.id, error: parsed.error },
      "Conversation todo: failed to parse LLM response"
    );
    return null;
  }
  return parsed.data;
}

// Maps raw LLM-extracted items to typed action items, reusing sIds from the
// previous version when the LLM echoes them back, generating new UUIDs otherwise.

export async function analyzeConversationTodos(
  auth: Authenticator,
  {
    conversation,
    messageId,
  }: {
    conversation: ConversationType;
    messageId: string;
  }
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  const { spaceId } = conversation;
  if (!spaceId) {
    logger.warn(
      { conversationId: conversation.id, workspaceId: owner.sId },
      "Conversation todo: skipping analysis for conversation without a space"
    );
    return;
  }

  // Fetch the model and the previous version concurrently — they are independent.
  const [model, previousVersion] = await Promise.all([
    getFastestWhitelistedModel(auth),
    TakeawaysResource.fetchLatestByConversationId(auth, {
      conversationId: conversation.sId,
    }),
  ]);
  if (!model) {
    logger.warn(
      { conversationId: conversation.id, workspaceId: owner.sId },
      "Conversation todo: no whitelisted model available"
    );
    return;
  }

  // Verify the source message still exists; skip analysis for deleted messages,
  // matching the same guard used by the butler evaluators.
  const sourceMessage = await MessageModel.findOne({
    attributes: ["id"],
    where: { sId: messageId, workspaceId: owner.id, visibility: "visible" },
  });
  if (!sourceMessage) {
    return;
  }

  const previousActionItems = previousVersion?.actionItems ?? [];
  const previousNotableFacts = previousVersion?.notableFacts ?? [];
  const previousKeyDecisions = previousVersion?.keyDecisions ?? [];
  const participants = getConversationParticipants(conversation);
  const participantSIds = new Set(participants.map((p) => p.sId));
  const prompt = [
    AGENTIC_CONTEXT_PREAMBLE,
    buildParticipantRoster(participants),
    buildPromptActionItems(previousActionItems),
    buildPromptNotableFacts(previousNotableFacts),
    buildPromptKeyDecisions(previousKeyDecisions),
    "You MUST call the tool. Always call it, even if there are no action items, notable facts, or key decisions (use empty arrays).",
  ].join("\n\n");
  const specification = buildSpec();
  const conv = await renderConversationForLLM(auth, {
    conversation,
    model,
    prompt,
  });
  if (!conv) {
    return;
  }

  const extraction = await callExtractActionItemsLLM(auth, {
    conv,
    model,
    specification,
    prompt,
    conversation,
  });
  if (!extraction) {
    return;
  }

  const actionItems = buildActionItems(
    extraction.action_items,
    new Set(previousActionItems.map((item) => item.sId)),
    participantSIds
  );
  const notableFacts = buildNotableFacts(
    extraction.notable_facts,
    new Set(previousNotableFacts.map((fact) => fact.sId)),
    participantSIds
  );
  const keyDecisions = buildKeyDecisions(
    extraction.key_decisions,
    new Set(previousKeyDecisions.map((d) => d.sId)),
    participantSIds
  );

  await TakeawaysResource.makeNewForConversation(auth, {
    conversationId: conversation.sId,
    spaceId,
    actionItems,
    notableFacts,
    keyDecisions,
  });

  logger.info(
    {
      conversationId: conversation.id,
      workspaceId: owner.sId,
      actionItemCount: actionItems.length,
      notableFactCount: notableFacts.length,
      keyDecisionCount: keyDecisions.length,
    },
    "Conversation todo: analysis complete"
  );
}
