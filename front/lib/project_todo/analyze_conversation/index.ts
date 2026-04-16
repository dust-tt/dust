import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { getFastestWhitelistedModel } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
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
  type ExtractionResult,
  ExtractTakeawaysInputSchema,
} from "@app/lib/project_todo/analyze_conversation/types";
import { buildSpec } from "@app/lib/project_todo/analyze_conversation/utils";
import {
  type TakeawaySourceDocument,
  TakeawaysResource,
} from "@app/lib/resources/takeaways_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import type {
  ConversationType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import { removeNulls } from "@app/types/shared/utils/general";
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

function _buildParticipantRoster(
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

const _AGENTIC_CONTEXT_PREAMBLE =
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
    model,
    specification,
    prompt,
    document,
  }: {
    model: ModelConfigurationType;
    specification: AgentActionSpecification;
    prompt: string;
    document: TakeawaySourceDocument;
  }
): Promise<ExtractionResult | null> {
  const owner = auth.getNonNullableWorkspace();
  const res = await startActiveObservation(
    "project-todo-analyze-document",
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
          conversation: {
            messages: [
              {
                role: "user",
                name: "todo_extractor",
                content: [{ type: "text", text: document.text }],
              },
            ],
          },
          prompt,
          specifications: [specification],
          forceToolCall: specification.name,
        },
        {
          context: {
            operationType: "project_todo_analyze_document",
            sourceId: document.id,
            sourceType: document.type,
            workspaceId: owner.sId,
          },
        }
      )
  );
  if (res.isErr()) {
    logger.error(
      {
        sourceId: document.id,
        sourceType: document.type,
        workspaceId: owner.sId,
        error: res.error,
      },
      "Document todo: LLM call failed"
    );
    return null;
  }

  const action = res.value.actions?.[0];
  if (!action?.arguments) {
    logger.warn(
      {
        sourceId: document.id,
        sourceType: document.type,
        workspaceId: owner.sId,
      },
      "Document todo: no tool call in LLM response"
    );
    return null;
  }

  const parsed = ExtractTakeawaysInputSchema.safeParse(action.arguments);
  if (!parsed.success) {
    logger.warn(
      {
        sourceId: document.id,
        sourceType: document.type,
        workspaceId: owner.sId,
        error: parsed.error,
        arguments: action.arguments,
      },
      "Document todo: failed to parse LLM response"
    );
    return null;
  }
  return parsed.data;
}

// Maps raw LLM-extracted items to typed action items, reusing sIds from the
// previous version when the LLM echoes them back, generating new UUIDs otherwise.

export async function extractDocumentTakeaways(
  auth: Authenticator,
  {
    spaceId,
    document,
  }: {
    spaceId: string;
    document: TakeawaySourceDocument;
  }
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  // Fetch the model and the previous version concurrently — they are independent.
  const [model, previousVersion] = await Promise.all([
    getFastestWhitelistedModel(auth),
    TakeawaysResource.fetchLatestBySourceIdAndType(auth, {
      sourceId: document.id,
      sourceType: document.type,
    }),
  ]);
  if (!model) {
    logger.warn(
      {
        sourceId: document.id,
        sourceType: document.type,
        workspaceId: owner.sId,
      },
      "Document todo: no whitelisted model available"
    );
    return;
  }

  const previousActionItems = previousVersion?.actionItems ?? [];
  const previousNotableFacts = previousVersion?.notableFacts ?? [];
  const previousKeyDecisions = previousVersion?.keyDecisions ?? [];
  // const participants = getConversationParticipants(conversation);
  // const participantSIds = new Set(participants.map((p) => p.sId));
  const prompt = [
    //AGENTIC_CONTEXT_PREAMBLE,
    //buildParticipantRoster(participants),
    buildPromptActionItems(previousActionItems),
    buildPromptNotableFacts(previousNotableFacts),
    buildPromptKeyDecisions(previousKeyDecisions),
    "You MUST call the tool. Always call it, even if there are no action items, notable facts, or key decisions (use empty arrays).",
  ].join("\n\n");
  const specification = buildSpec();

  const extraction = await callExtractActionItemsLLM(auth, {
    model,
    specification,
    prompt,
    document,
  });
  if (!extraction) {
    logger.error(
      {
        sourceId: document.id,
        sourceType: document.type,
        workspaceId: owner.sId,
      },
      "Document todo: no extraction result"
    );
    return;
  }

  // Fetch all assignees from the action items.
  const assignees = await UserResource.fetchByIds(
    removeNulls([
      ...new Set([
        ...extraction.action_items.map((item) => item.assignee_user_id),
        ...extraction.notable_facts
          .map((fact) => fact.relevant_user_ids)
          .flat(),
        ...extraction.key_decisions.map((d) => d.relevant_user_ids).flat(),
      ]),
    ])
  );

  const exitingAssignees = new Set(assignees.map((u) => u.sId));

  const actionItems = buildActionItems(
    extraction.action_items,
    new Set(previousActionItems.map((item) => item.sId)),
    exitingAssignees
  );
  const notableFacts = buildNotableFacts(
    extraction.notable_facts,
    new Set(previousNotableFacts.map((fact) => fact.sId)),
    exitingAssignees
  );
  const keyDecisions = buildKeyDecisions(
    extraction.key_decisions,
    new Set(previousKeyDecisions.map((d) => d.sId)),
    exitingAssignees
  );

  if (
    actionItems.length === 0 &&
    notableFacts.length === 0 &&
    keyDecisions.length === 0
  ) {
    logger.info(
      {
        sourceId: document.id,
        sourceType: document.type,
        workspaceId: owner.sId,
      },
      "Conversation todo: no takeaways extracted"
    );
    return;
  }

  await TakeawaysResource.makeNewForDocument(auth, {
    document,
    spaceId,
    actionItems,
    notableFacts,
    keyDecisions,
  });

  logger.info(
    {
      sourceId: document.id,
      sourceType: document.type,
      workspaceId: owner.sId,
      actionItemCount: actionItems.length,
      notableFactCount: notableFacts.length,
      keyDecisionCount: keyDecisions.length,
    },
    "Conversation todo: analysis complete"
  );
}
