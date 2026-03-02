import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { renderConversationForModel } from "@app/lib/api/assistant/conversation_rendering";
import { publishConversationEvent } from "@app/lib/api/assistant/streaming/events";
import type { Authenticator } from "@app/lib/auth";
import { MessageModel } from "@app/lib/models/agent/conversation";
import { ConversationButlerSuggestionResource } from "@app/lib/resources/conversation_butler_suggestion_resource";
import logger from "@app/logger/logger";
import { getFastestWhitelistedModel } from "@app/types/assistant/assistant";
import type {
  ButlerSuggestionCreatedEvent,
  ConversationType,
} from "@app/types/assistant/conversation";

const RENAME_TITLE_FUNCTION_NAME = "rename_title_decision";

const renameTitleSpecifications: AgentActionSpecification[] = [
  {
    name: RENAME_TITLE_FUNCTION_NAME,
    description: "Evaluate whether the conversation title should be updated.",
    inputSchema: {
      type: "object",
      properties: {
        confidence: {
          type: "number",
          description:
            "Confidence from 0 to 100 that renaming would improve the title. " +
            "Use 0 if the current title is already adequate.",
        },
        new_title: {
          type: "string",
          description: "The proposed new title (3-8 words).",
        },
      },
      required: ["confidence", "new_title"],
    },
  },
];

const RENAME_TITLE_PROMPT =
  "You are a conversation title evaluator. Your job is to score how much " +
  "the conversation title would benefit from being updated.\n\n" +
  "Guidelines:\n" +
  "- The current title was auto-generated early in the conversation and may no longer reflect the main topic.\n" +
  "- A good title is 3-8 words, specific, and captures the main intent.\n" +
  "- Set confidence HIGH (>75) only when the current title is clearly wrong, misleading, " +
  "or the conversation has shifted to a completely different topic.\n" +
  "- Set confidence LOW (<30) when the current title is already a reasonable summary, " +
  "or the difference is just stylistic.\n" +
  "- Be conservative — most auto-generated titles are adequate.\n" +
  "- You MUST call the tool. Always call it.";

/**
 * Evaluate whether a conversation title should be renamed using an LLM.
 * If confidence is high enough, persists a suggestion and publishes a
 * conversation event.
 */
export async function evaluateRenameTitleSuggestion(
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
  // fast because we want a ... fast answer
  const model = getFastestWhitelistedModel(owner);
  if (!model) {
    logger.warn(
      { conversationId: conversation.id, workspaceId: owner.sId },
      "Butler: no whitelisted model available for title evaluation"
    );
    return;
  }

  const currentTitle = conversation.title ?? "";
  const prompt =
    RENAME_TITLE_PROMPT +
    `\n\nThe current conversation title is: "${currentTitle}"`;

  const modelConversationRes = await renderConversationForModel(auth, {
    conversation,
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
        conversationId: conversation.id,
        error: modelConversationRes.error,
      },
      "Butler: failed to render conversation for title evaluation"
    );
    return;
  }

  const { modelConversation: conv } = modelConversationRes.value;
  if (conv.messages.length === 0) {
    return;
  }

  const res = await runMultiActionsAgent(
    auth,
    {
      providerId: model.providerId,
      modelId: model.modelId,
      functionCall: RENAME_TITLE_FUNCTION_NAME,
      useCache: false,
    },
    {
      conversation: conv,
      prompt,
      specifications: renameTitleSpecifications,
      forceToolCall: RENAME_TITLE_FUNCTION_NAME,
    },
    {
      context: {
        operationType: "butler_rename_title",
        conversationId: conversation.sId,
        workspaceId: owner.sId,
      },
    }
  );

  if (res.isErr()) {
    logger.error(
      { conversationId: conversation.id, error: res.error },
      "Butler: LLM call failed for title evaluation"
    );
    return;
  }

  const action = res.value.actions?.[0];
  if (!action?.arguments) {
    logger.warn(
      { conversationId: conversation.id },
      "Butler: no tool call in LLM response for title evaluation"
    );
    return;
  }

  const { confidence, new_title } = action.arguments as {
    confidence: number;
    new_title: string;
  };

  logger.info(
    {
      workspaceId: owner.sId,
      conversationId: conversation.id,
      currentTitle,
      confidence,
      newTitle: new_title,
    },
    "Butler: title evaluation result"
  );

  if (confidence < 70 || !new_title) {
    return;
  }

  // Skip if the suggested title is the same as the current one.
  if (new_title.trim().toLowerCase() === currentTitle.trim().toLowerCase()) {
    return;
  }

  // Find the source message that triggered this analysis.
  const sourceMessage = await MessageModel.findOne({
    where: {
      sId: messageId,
      workspaceId: owner.id,
    },
  });

  if (!sourceMessage) {
    return;
  }

  const suggestion = await ConversationButlerSuggestionResource.makeNew(auth, {
    conversationId: conversation.id,
    sourceMessageId: sourceMessage.id,
    suggestionType: "rename_title",
    metadata: { suggestedTitle: new_title },
    status: "pending",
  });

  const event: ButlerSuggestionCreatedEvent = {
    type: "butler_suggestion_created",
    created: Date.now(),
    suggestion: suggestion.toJSON(),
  };

  await publishConversationEvent(event, {
    conversationId: conversation.sId,
  });

  logger.info(
    {
      conversationId: conversation.id,
      suggestedTitle: new_title,
      confidence,
    },
    "Butler: created rename_title suggestion"
  );
}
