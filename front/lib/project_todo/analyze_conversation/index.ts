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
import type { ConversationType } from "@app/types/assistant/conversation";
import type { ModelConversationTypeMultiActions } from "@app/types/assistant/generation";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";

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
  const res = await runMultiActionsAgent(
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
  const prompt = [
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
    new Set(previousActionItems.map((item) => item.sId))
  );
  const notableFacts = buildNotableFacts(
    extraction.notable_facts,
    new Set(previousNotableFacts.map((fact) => fact.sId))
  );
  const keyDecisions = buildKeyDecisions(
    extraction.key_decisions,
    new Set(previousKeyDecisions.map((d) => d.sId))
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
