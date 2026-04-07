import { groupMessagesIntoInteractions } from "@app/lib/api/assistant/conversation/interactions";
import { renderAllMessages } from "@app/lib/api/assistant/conversation_rendering/message_rendering";
import { getTextContentFromMessage } from "@app/lib/api/assistant/utils";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import { tokenCountForTexts } from "@app/lib/tokenization";
import logger from "@app/logger/logger";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { ConversationType } from "@app/types/assistant/conversation";
import type {
  ModelConversationTypeMultiActions,
  ModelMessageTypeMultiActions,
  ModelMessageTypeMultiActionsWithoutContentFragment,
} from "@app/types/assistant/generation";
import {
  isContentFragmentMessageTypeModel,
  isImageContent,
  isTextContent,
} from "@app/types/assistant/generation";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { CredentialsType } from "@app/types/provider";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { MessageWithTokens } from "./pruning";
import {
  getInteractionTokenCount,
  progressivelyPruneInteraction,
  prunePreviousInteractions,
} from "./pruning";

// When previous interactions pruning is enabled, we'll attempt to fully preserve this number of
// interactions. This value was originally at 1 and bumped at 3 with the introduction of
// gracefully_stopped agent message and user message steering to don't prune tool outputs too
// agressively.
export const PREVIOUS_INTERACTIONS_TO_PRESERVE = 3;

// Fixed number of tokens assumed for image contents
const IMAGE_CONTENT_TOKEN_COUNT = 3100;
export const TOOL_DEFINITIONS_COUNT_ADJUSTMENT_FACTOR = 0.7;
export const TOKENS_MARGIN = 1024;

export async function renderConversationForModel(
  auth: Authenticator,
  {
    conversation,
    model,
    prompt,
    tools,
    allowedTokenCount,
    excludeActions,
    excludeImages,
    onMissingAction = "inject-placeholder",
    agentConfiguration,
  }: {
    conversation: ConversationType;
    model: ModelConfigurationType;
    prompt: string;
    tools: string;
    allowedTokenCount: number;
    excludeActions?: boolean;
    excludeImages?: boolean;
    onMissingAction?: "inject-placeholder" | "skip";
    enablePreviousInteractionsPruning?: boolean;
    agentConfiguration?: AgentConfigurationType;
  }
): Promise<
  Result<
    {
      modelConversation: ModelConversationTypeMultiActions;
      tokensUsed: number;
      prunedContext: boolean;
    },
    Error
  >
> {
  const now = Date.now();
  let stepStart = now;

  const messages = await renderAllMessages(auth, {
    conversation,
    model,
    excludeActions,
    excludeImages,
    onMissingAction,
    agentConfiguration,
  });
  const renderAllMessagesMs = Date.now() - stepStart;
  stepStart = Date.now();

  const credentials = await getLlmCredentials(auth, {
    skipEmbeddingApiKeyRequirement: true,
  });
  const getLlmCredentialsMs = Date.now() - stepStart;
  stepStart = Date.now();

  // Tokenize messages and prompt/tools in parallel to reduce latency
  const countMessagesPromise = (async () => {
    const start = Date.now();
    const r = await countTokensForMessages(messages, model, credentials);
    return { r, elapsedMs: Date.now() - start };
  })();
  const countPromptToolsPromise = (async () => {
    const start = Date.now();
    const r = await tokenCountForTexts([prompt, tools], model, credentials);
    return { r, elapsedMs: Date.now() - start };
  })();
  const [messagesWithTokensWrapped, promptToolsWrapped] = await Promise.all([
    countMessagesPromise,
    countPromptToolsPromise,
  ]);
  const parallelTokenizationWallMs = Date.now() - stepStart;
  const countTokensForMessagesMs = messagesWithTokensWrapped.elapsedMs;
  const tokenCountPromptToolsMs = promptToolsWrapped.elapsedMs;
  const messagesWithTokensRes = messagesWithTokensWrapped.r;
  const promptToolsRes = promptToolsWrapped.r;

  stepStart = Date.now();

  if (messagesWithTokensRes.isErr()) {
    return messagesWithTokensRes;
  }

  if (promptToolsRes.isErr()) {
    return promptToolsRes;
  }

  const messagesWithTokens = messagesWithTokensRes.value;
  const [promptCount, toolDefinitionsCount] = promptToolsRes.value;

  // Calculate base token usage.
  const baseTokens =
    promptCount +
    Math.floor(
      toolDefinitionsCount * TOOL_DEFINITIONS_COUNT_ADJUSTMENT_FACTOR
    ) +
    TOKENS_MARGIN;

  const interactions = groupMessagesIntoInteractions(messagesWithTokens);
  let currentInteraction = interactions[interactions.length - 1];
  let currentInteractionTokens = getInteractionTokenCount(currentInteraction);

  let availableTokens = allowedTokenCount - baseTokens;

  if (currentInteractionTokens > availableTokens) {
    // The last interaction does not fit within the token budget.
    // We apply progressive pruning to that interaction until it fits within the token budget.
    currentInteraction = progressivelyPruneInteraction(
      currentInteraction,
      availableTokens
    );
    if (currentInteraction.prunedContext) {
      logger.warn(
        {
          workspaceId: conversation.owner.sId,
          conversationId: conversation.sId,
          currentInteractionTokens,
          availableTokens,
        },
        "Last tool result was pruned to fit in context window."
      );
    }
    currentInteractionTokens = getInteractionTokenCount(currentInteraction);
    if (currentInteractionTokens > availableTokens) {
      logger.error(
        {
          workspaceId: conversation.owner.sId,
          conversationId: conversation.sId,
        },
        "Render Conversation V2: No interactions fit in context window."
      );
      return new Err(
        new Error("Context window exceeded: at least one message is required")
      );
    }
    availableTokens -= currentInteractionTokens;
  }

  let previousInteractions = interactions.slice(0, -1);

  // prune previous interactions.
  previousInteractions = prunePreviousInteractions(
    previousInteractions,
    availableTokens,
    PREVIOUS_INTERACTIONS_TO_PRESERVE
  );

  const prunedInteractions = [...previousInteractions, currentInteraction];

  // Select interactions that fit within token budget.
  const selected: MessageWithTokens[] = [];
  let tokensUsed = baseTokens;

  // Go backward through interactions.
  for (let i = prunedInteractions.length - 1; i >= 0; i--) {
    const interaction = prunedInteractions[i];

    const interactionTokens = getInteractionTokenCount(interaction);
    if (tokensUsed + interactionTokens <= allowedTokenCount) {
      tokensUsed += interactionTokens;
      selected.unshift(...interaction.messages);
    } else {
      break;
    }
  }

  // Merge content fragments into user messages.
  for (let i = selected.length - 1; i >= 0; i--) {
    const cfMessage = selected[i];
    if (isContentFragmentMessageTypeModel(cfMessage)) {
      const userMessage = selected[i + 1];
      if (!userMessage || userMessage.role !== "user") {
        logger.error(
          {
            workspaceId: conversation.owner.sId,
            conversationId: conversation.sId,
            selected: selected.map((m) => ({
              ...m,
              content:
                getTextContentFromMessage(m)?.slice(0, 100) + " (truncated...)",
            })),
          },
          "Unexpected state, cannot find user message after a Content Fragment"
        );
        throw new Error(
          "Unexpected state, cannot find user message after a Content Fragment"
        );
      }

      userMessage.content = [...cfMessage.content, ...userMessage.content];
      selected.splice(i, 1);
    }
  }

  if (selected.length === 0) {
    logger.error(
      {
        workspaceId: conversation.owner.sId,
        conversationId: conversation.sId,
      },
      "Render Conversation V2: No interactions fit in context window."
    );
    return new Err(
      new Error("Context window exceeded: at least one message is required")
    );
  }

  // Remove tokenCount from final messages and remove content fragments from return type
  const finalMessages = selected
    .map(({ tokenCount: _tokenCount, ...msg }) => msg)
    // There should be no content fragments as they have been merged into user messages
    // TODO: refactor how we define the selected array
    .filter(
      (
        message
      ): message is ModelMessageTypeMultiActionsWithoutContentFragment =>
        message.role !== "content_fragment"
    );

  const prunedContext = currentInteraction.prunedContext ?? false;

  const pruneSelectAndFinalizeMs = Date.now() - stepStart;

  logger.info(
    {
      workspaceId: conversation.owner.sId,
      conversationId: conversation.sId,
      messageCount: messages.length,
      promptToken: promptCount,
      tokensUsed,
      messageSelected: finalMessages.length,
      prunedContext,
      elapsed: Date.now() - now,
      renderAllMessagesMs,
      getLlmCredentialsMs,
      countTokensForMessagesMs,
      tokenCountPromptToolsMs,
      parallelTokenizationWallMs,
      pruneSelectAndFinalizeMs,
    },
    "[ASSISTANT_TRACE] renderConversationForModelEnhanced"
  );

  return new Ok({
    modelConversation: {
      messages: finalMessages,
    },
    tokensUsed,
    prunedContext,
  });
}

async function countTokensForMessages(
  messages: ModelMessageTypeMultiActions[],
  model: ModelConfigurationType,
  credentials: CredentialsType
): Promise<Result<MessageWithTokens[], Error>> {
  const textRepresentations: string[] = [];
  const additionalTokens: number[] = [];

  for (const [i, m] of messages.entries()) {
    additionalTokens[i] = 0;

    let text = `${m.role} ${"name" in m ? m.name : ""} `;

    if (m.role === "user" || m.role === "content_fragment") {
      const textContents: string[] = [];
      for (const c of m.content) {
        if (isTextContent(c)) {
          textContents.push(c.text);
        } else if (isImageContent(c)) {
          additionalTokens[i] += IMAGE_CONTENT_TOKEN_COUNT;
        } else {
          assertNever(c);
        }
      }
      text += textContents.join("\n");
    } else if (m.role === "assistant") {
      //  Use the `contents` if available.
      if (m.contents?.length) {
        for (const c of m.contents) {
          if (c.type === "reasoning") {
            additionalTokens[i] += c.value.tokens;
          } else if (c.type === "text_content") {
            text += c.value;
          } else if (c.type === "function_call") {
            text += `${c.value.name} ${c.value.arguments}`;
          } else {
            assertNever(c);
          }
        }
      } else if (m.content) {
        // Fallback to legacy `content` field if `contents` is not available.
        text += m.content;
      }
    } else if (m.role === "function") {
      const content = Array.isArray(m.content)
        ? m.content
        : [{ type: "text" as const, text: m.content }];
      const textContents: string[] = [];
      for (const c of content) {
        if (isTextContent(c)) {
          textContents.push(c.text);
        } else if (isImageContent(c)) {
          additionalTokens[i] += IMAGE_CONTENT_TOKEN_COUNT;
        } else {
          assertNever(c);
        }
      }
      text += textContents.join("\n");
    } else {
      assertNever(m);
    }

    textRepresentations.push(text);
  }

  const res = await tokenCountForTexts(textRepresentations, model, credentials);
  if (res.isErr()) {
    return res;
  }

  const textCounts = res.value;

  return new Ok(
    textCounts.map((count, i) => ({
      ...messages[i],
      tokenCount: count + additionalTokens[i],
    }))
  );
}
