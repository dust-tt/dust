import { INTERACTIVE_CONTENT_SERVER_NAME } from "@app/lib/api/actions/servers/interactive_content/metadata";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { renderConversationForModel } from "@app/lib/api/assistant/conversation_rendering";
import { publishConversationEvent } from "@app/lib/api/assistant/streaming/events";
import type { Authenticator } from "@app/lib/auth";
import {
  getAllEvaluators,
  getEvaluatorForPass,
} from "@app/lib/butler/evaluator_registry";
import type {
  ButlerEvaluator,
  EvaluatorContext,
  EvaluatorResult,
} from "@app/lib/butler/evaluators/types";
import { MessageModel } from "@app/lib/models/agent/conversation";
import { ConversationButlerSuggestionResource } from "@app/lib/resources/conversation_butler_suggestion_resource";
import logger from "@app/logger/logger";
import { getFastestWhitelistedModel } from "@app/types/assistant/assistant";
import type {
  ButlerDoneEvent,
  ButlerSuggestionCreatedEvent,
  ButlerThinkingEvent,
  ConversationType,
} from "@app/types/assistant/conversation";
import { isAgentMessageType } from "@app/types/assistant/conversation";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { ButlerSuggestionType } from "@app/types/conversation_butler_suggestion";
import type { ModelId } from "@app/types/shared/model_id";

// Minimum number of messages (by rank distance) between two suggestions of the same type.
const SUGGESTION_COOLDOWN_MESSAGES = 10;

/**
 * Single pass over conversation content to extract:
 * - The sIds of agents already participating in the conversation.
 * - Whether any agent has created a Frame (used the interactive_content MCP server).
 */
function analyzeConversationContent(conversation: ConversationType): {
  participantIds: Set<string>;
  hasFrame: boolean;
} {
  const participantIds = new Set<string>();
  let hasFrame = false;
  for (const messageGroup of conversation.content) {
    for (const message of messageGroup) {
      if (isAgentMessageType(message)) {
        participantIds.add(message.configuration.sId);
        if (!hasFrame) {
          for (const action of message.actions) {
            if (
              action.internalMCPServerName === INTERACTIVE_CONTENT_SERVER_NAME
            ) {
              hasFrame = true;
              break;
            }
          }
        }
      }
    }
  }
  return { participantIds, hasFrame };
}

/*
 * Determine whether a new suggestion of the given type should be proposed.
 *
 * Rules:
 * - If the most recent suggestion of this type is still pending and was
 *   created within the last SUGGESTION_COOLDOWN_MESSAGES messages -> skip
 *   (the user can still see it).
 * - If the most recent suggestion is still pending but is older than
 *   SUGGESTION_COOLDOWN_MESSAGES messages -> auto-dismiss it (it's scrolled
 *   off-screen) and allow a new one.
 * - If the most recent suggestion was dismissed/accepted within the last
 *   SUGGESTION_COOLDOWN_MESSAGES messages -> skip (respect cooldown).
 * - Otherwise -> allow.
 */
async function shouldProposeSuggestion(
  auth: Authenticator,
  {
    conversationId,
    currentMessageRank,
    suggestionType,
  }: {
    conversationId: ModelId;
    currentMessageRank: number;
    suggestionType: ButlerSuggestionType;
  }
): Promise<boolean> {
  const latest =
    await ConversationButlerSuggestionResource.fetchLatestByConversationAndType(
      auth,
      { conversationId, suggestionType }
    );

  if (!latest) {
    return true;
  }

  // Resolve the rank of the message that triggered the previous suggestion.
  const previousSourceMessage = await MessageModel.findOne({
    attributes: ["rank"],
    where: {
      id: latest.sourceMessageId,
      workspaceId: auth.getNonNullableWorkspace().id,
      visibility: "visible", // to check for deletion
    },
  });

  // If the source message was deleted/not existing, allow a new suggestion.
  if (!previousSourceMessage) {
    return true;
  }

  const rankDistance = currentMessageRank - previousSourceMessage.rank;
  const withinCooldown = rankDistance < SUGGESTION_COOLDOWN_MESSAGES;

  if (latest.status === "pending") {
    if (withinCooldown) {
      // Still visible — skip.
      return false;
    }
    // Stale pending suggestion scrolled off-screen — auto-dismiss it.
    await latest.autoDismiss();
    return true;
  }

  // Dismissed or accepted — respect cooldown.
  return !withinCooldown;
}

/**
 * Run a single evaluator: build prompt, call LLM, parse result.
 */
async function runEvaluator(
  auth: Authenticator,
  evaluator: ButlerEvaluator,
  context: EvaluatorContext,
  model: ModelConfigurationType
): Promise<EvaluatorResult | null> {
  const owner = auth.getNonNullableWorkspace();
  const { prompt, specification } = evaluator.getPromptAndSpec(context);

  const modelConversationRes = await renderConversationForModel(auth, {
    conversation: context.conversation,
    model,
    prompt,
    tools: "",
    allowedTokenCount: model.contextSize - model.generationTokensCount,
    excludeActions: true,
    excludeImages: true,
  });

  if (modelConversationRes.isErr()) {
    logger.error(
      {
        conversationId: context.conversation.id,
        evaluator: evaluator.type,
        error: modelConversationRes.error,
      },
      "Butler: failed to render conversation for evaluator"
    );
    return null;
  }

  const { modelConversation: conv } = modelConversationRes.value;
  if (conv.messages.length === 0) {
    return null;
  }

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
        operationType: "butler_analyze_conversation",
        conversationId: context.conversation.sId,
        workspaceId: owner.sId,
      },
    }
  );

  if (res.isErr()) {
    logger.error(
      {
        conversationId: context.conversation.id,
        evaluator: evaluator.type,
        error: res.error,
      },
      "Butler: LLM call failed for evaluator"
    );
    return null;
  }

  const action = res.value.actions?.[0];
  if (!action?.arguments) {
    logger.warn(
      { conversationId: context.conversation.id, evaluator: evaluator.type },
      "Butler: no tool call in LLM response for evaluator"
    );
    return null;
  }

  return evaluator.parseResult(action.arguments, context);
}

/**
 * Given an evaluator result, check throttling and create the suggestion.
 */
async function createSuggestionFromResult(
  auth: Authenticator,
  result: EvaluatorResult,
  context: EvaluatorContext
): Promise<void> {
  const shouldPropose = await shouldProposeSuggestion(auth, {
    conversationId: context.conversation.id,
    currentMessageRank: context.sourceMessageRank,
    suggestionType: result.suggestionType,
  });

  if (!shouldPropose) {
    return;
  }

  const suggestion = await ConversationButlerSuggestionResource.makeNew(auth, {
    conversationId: context.conversation.id,
    sourceMessageId: context.sourceMessageId,
    suggestionType: result.suggestionType,
    metadata: result.metadata,
    status: "pending",
  });

  const event: ButlerSuggestionCreatedEvent = {
    type: "butler_suggestion_created",
    created: Date.now(),
    suggestion: suggestion.toJSON(),
  };

  await publishConversationEvent(event, {
    conversationId: context.conversation.sId,
  });
}

/**
 * Build the shared EvaluatorContext from the conversation state.
 */
async function buildEvaluatorContext(
  auth: Authenticator,
  conversation: ConversationType,
  sourceMessage: { id: ModelId; rank: number }
): Promise<EvaluatorContext> {
  const { participantIds, hasFrame } = analyzeConversationContent(conversation);

  const allAgents = await getAgentConfigurationsForView({
    auth,
    agentsGetView: "list",
    variant: "extra_light",
    sort: "priority",
  });

  const availableAgents = allAgents.filter(
    (a) => a.scope !== "global" && !participantIds.has(a.sId)
  );

  const suggestionHistory =
    await ConversationButlerSuggestionResource.fetchResolvedByConversation(
      auth,
      { conversationId: conversation.id, limit: 10 }
    );

  return {
    conversation,
    currentTitle: conversation.title ?? "",
    availableAgents,
    hasFrame,
    sourceMessageId: sourceMessage.id,
    sourceMessageRank: sourceMessage.rank,
    suggestionHistory,
  };
}

/**
 * Analyze a conversation by running evaluators and creating suggestions.
 *
 * When `passIndex` is provided, only the evaluator selected by rotation runs
 * (stagger mode -- reduces suggestion fatigue). When omitted or -1, all
 * evaluators run (used for the final/complete pass after butler_complete signal).
 */
export async function analyzeConversation(
  auth: Authenticator,
  {
    conversation,
    messageId,
    passIndex = -1,
  }: {
    conversation: ConversationType;
    messageId: string;
    passIndex?: number;
  }
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  const thinkingEvent: ButlerThinkingEvent = {
    type: "butler_thinking",
    created: Date.now(),
  };
  await publishConversationEvent(thinkingEvent, {
    conversationId: conversation.sId,
  });

  try {
    const model = getFastestWhitelistedModel(owner);
    if (!model) {
      logger.warn(
        { conversationId: conversation.id, workspaceId: owner.sId },
        "Butler: no whitelisted model available for conversation analysis"
      );
      return;
    }

    // Find the source message that triggered this analysis.
    const sourceMessage = await MessageModel.findOne({
      where: {
        sId: messageId,
        workspaceId: owner.id,
        visibility: "visible",
      },
    });

    if (!sourceMessage) {
      return;
    }

    const context = await buildEvaluatorContext(auth, conversation, {
      id: sourceMessage.id,
      rank: sourceMessage.rank,
    });

    // Select evaluators based on pass mode.
    let evaluatorsToRun: ButlerEvaluator[];
    if (passIndex >= 0) {
      // Stagger mode: pick one evaluator from the rotation.
      const selected = getEvaluatorForPass(passIndex);
      evaluatorsToRun = [selected];
    } else {
      // Complete mode: run all evaluators.
      evaluatorsToRun = getAllEvaluators();
    }

    // Filter to evaluators that should actually run.
    evaluatorsToRun = evaluatorsToRun.filter((e) => e.shouldRun(context));

    for (const evaluator of evaluatorsToRun) {
      const result = await runEvaluator(auth, evaluator, context, model);
      if (result) {
        await createSuggestionFromResult(auth, result, context);
      }
    }
  } finally {
    const doneEvent: ButlerDoneEvent = {
      type: "butler_done",
      created: Date.now(),
    };
    await publishConversationEvent(doneEvent, {
      conversationId: conversation.sId,
    });
  }
}
