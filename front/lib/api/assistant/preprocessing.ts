import {
  getTextContentFromMessage,
  getTextRepresentationFromMessages,
} from "@app/lib/api/assistant/utils";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { renderLightContentFragmentForModel } from "@app/lib/resources/content_fragment_resource";
import { tokenCountForTexts } from "@app/lib/tokenization";
import logger from "@app/logger/logger";
import type {
  AssistantContentMessageTypeModel,
  AssistantFunctionCallMessageTypeModel,
  ConversationType,
  FunctionCallType,
  FunctionMessageTypeModel,
  ImageContent,
  ModelConfigurationType,
  ModelConversationTypeMultiActions,
  ModelMessageTypeMultiActions,
  Result,
  TextContent,
} from "@app/types";
import {
  assertNever,
  Err,
  isAgentMessageType,
  isContentFragmentMessageTypeModel,
  isContentFragmentType,
  isImageContent,
  isTextContent,
  isUserMessageType,
  Ok,
  removeNulls,
} from "@app/types";
import type {
  AgentContentItemType,
  ErrorContentType,
  TextContentType,
} from "@app/types/assistant/agent_message_content";

/**
 * Model conversation rendering
 */

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
  }: {
    conversation: ConversationType;
    model: ModelConfigurationType;
    prompt: string;
    tools: string;
    allowedTokenCount: number;
    excludeActions?: boolean;
    excludeImages?: boolean;
  }
): Promise<
  Result<
    {
      modelConversation: ModelConversationTypeMultiActions;
      tokensUsed: number;
    },
    Error
  >
> {
  const supportedModel = getSupportedModelConfig(model);

  const now = Date.now();
  const messages: ModelMessageTypeMultiActions[] = [];

  // Render loop: render all messages and all actions.
  for (const versions of conversation.content) {
    const m = versions[versions.length - 1];

    if (isAgentMessageType(m)) {
      const actions = removeNulls(m.actions);

      // This is a record of arrays, because we can have multiple calls per agent message (parallel
      // calls).  Actions all have a step index which indicates how they should be grouped but some
      // actions injected by `getEmulatedAgentMessageActions` have a step index of `-1`. We
      // therefore group by index, then order and transform in a 2D array to present to the model.
      const stepByStepIndex = {} as Record<
        string,
        {
          contents: Array<Exclude<AgentContentItemType, ErrorContentType>>;
          actions: Array<{
            call: FunctionCallType;
            result: FunctionMessageTypeModel;
          }>;
        }
      >;

      const emptyStep = () =>
        ({
          contents: [],
          actions: [],
        }) satisfies (typeof stepByStepIndex)[number];

      for (const action of actions) {
        const stepIndex = action.step;
        stepByStepIndex[stepIndex] = stepByStepIndex[stepIndex] || emptyStep();
        // All these calls are not async, so we're not doing a Promise.all for now but might need to
        // be reconsidered in the future.
        stepByStepIndex[stepIndex].actions.push({
          call: action.renderForFunctionCall(),
          result: await action.renderForMultiActionsModel(auth, {
            model,
          }),
        });
      }

      for (const content of m.contents) {
        if (content.content.type === "error") {
          // Don't render error content.
          logger.warn(
            {
              workspaceId: conversation.owner.sId,
              conversationId: conversation.sId,
              agentMessageId: m.sId,
            },
            "agent message step with error content in renderConversationForModelMultiActions"
          );
          continue;
        }

        if (
          content.content.type === "reasoning" &&
          content.content.value.provider !== supportedModel.providerId
        ) {
          // Skip reasoning content from other providers.
          continue;
        }

        stepByStepIndex[content.step] =
          stepByStepIndex[content.step] || emptyStep();

        stepByStepIndex[content.step].contents.push(content.content);
      }

      const steps = Object.entries(stepByStepIndex)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, step]) => step);

      if (excludeActions) {
        // In Exclude Actions mode, we only render the last step that has text content.
        const stepsWithContent = steps.filter((s) =>
          s?.contents.some((c) => c.type === "text_content")
        );
        if (stepsWithContent.length) {
          const lastStepWithContent =
            stepsWithContent[stepsWithContent.length - 1];
          const textContents: TextContentType[] = [];
          for (const content of lastStepWithContent.contents) {
            if (content.type === "text_content") {
              textContents.push(content);
            }
          }
          messages.push({
            role: "assistant",
            name: m.configuration.name,
            content: textContents.map((c) => c.value).join("\n"),
            contents: lastStepWithContent.contents,
          } satisfies AssistantContentMessageTypeModel);
        }
      } else {
        // In regular mode, we render all steps.
        for (const step of steps) {
          if (!step) {
            logger.error(
              {
                workspaceId: conversation.owner.sId,
                conversationId: conversation.sId,
                agentMessageId: m.sId,
                panic: true,
              },
              "Unexpected state, agent message step is empty"
            );
            continue;
          }
          const textContents: TextContentType[] = [];
          for (const content of step.contents) {
            if (content.type === "text_content") {
              textContents.push(content);
            }
          }
          if (!step.actions.length && !textContents.length) {
            logger.error(
              {
                workspaceId: conversation.owner.sId,
                conversationId: conversation.sId,
                agentMessageId: m.sId,
              },
              "Unexpected state, agent message step with no actions and no contents"
            );
            continue;
          }

          if (step.actions.length) {
            messages.push({
              role: "assistant",
              function_calls: step.actions.map((s) => s.call),
              content: textContents.map((c) => c.value).join("\n"),
              contents: step.contents,
            } satisfies AssistantFunctionCallMessageTypeModel);
          } else {
            messages.push({
              role: "assistant",
              content: textContents.map((c) => c.value).join("\n"),
              name: m.configuration.name,
              contents: step.contents,
            } satisfies AssistantContentMessageTypeModel);
          }

          for (const { result } of step.actions) {
            messages.push(result);
          }
        }
      }

      if (!m.rawContents.length && m.content?.trim()) {
        // We need to maintain support for legacy agent messages that don't have rawContents.
        messages.push({
          role: "assistant",
          name: m.configuration.name,
          content: m.content,
        });
      }
    } else if (isUserMessageType(m)) {
      // Replace all `:mention[{name}]{.*}` with `@name`.
      const content = m.content.replaceAll(
        /:mention\[([^\]]+)\]\{[^}]+\}/g,
        (_, name) => {
          return `@${name}`;
        }
      );
      messages.push({
        role: "user" as const,
        name: m.context.fullName || m.context.username,
        content: [
          {
            type: "text",
            text: content,
          },
        ],
      });
    } else if (isContentFragmentType(m)) {
      messages.push(
        await renderLightContentFragmentForModel(auth, m, conversation, model, {
          excludeImages: Boolean(excludeImages),
        })
      );
    } else {
      assertNever(m);
    }
  }

  // Compute in parallel the token count for each message and the prompt.
  const res = await tokenCountForTexts(
    [prompt, tools, ...getTextRepresentationFromMessages(messages)],
    model
  );
  if (res.isErr()) {
    return new Err(res.error);
  }

  const [promptCount, toolDefinitionsCount, ...messagesCount] = res.value;

  // Add reasoning content token count to each message.
  for (const [i, message] of messages.entries()) {
    if (message.role === "assistant") {
      for (const content of message.contents ?? []) {
        if (content.type === "reasoning") {
          messagesCount[i] += content.value.tokens ?? 0;
        }
      }
    }
  }

  // Models turns the json schema into an internal representation that is more efficient to tokenize.
  const toolDefinitionsCountAdjustmentFactor = 0.7;

  // We initialize `tokensUsed` to the prompt tokens + a bit of buffer for message rendering
  // approximations.
  const tokensMargin = 1024;
  let tokensUsed =
    promptCount +
    Math.floor(toolDefinitionsCount * toolDefinitionsCountAdjustmentFactor) +
    tokensMargin;

  // Perform message selection
  const messageSelectionResult = performMessageSelection(
    messages,
    messagesCount,
    allowedTokenCount,
    tokensUsed
  );
  let selected = messageSelectionResult.selected;
  const finalTokensUsed = messageSelectionResult.tokensUsed;

  // Post-process selected messages
  const postProcessed = postProcessSelectedMessages(
    selected,
    messagesCount,
    messages.length,
    conversation,
    finalTokensUsed
  );
  selected = postProcessed.selected;
  tokensUsed = postProcessed.tokensUsed;

  logger.info(
    {
      workspaceId: conversation.owner.sId,
      conversationId: conversation.sId,
      messageCount: messages.length,
      promptToken: promptCount,
      tokensUsed,
      messageSelected: selected.length,
      elapsed: Date.now() - now,
    },
    "[ASSISTANT_TRACE] renderConversationForModelMultiActions"
  );

  // Fallback mechanism when context window is overloaded
  if (selected.length === 0 && messages.length > 0) {
    // Find the last agent message with tool calls
    let lastAgentMessageIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (
        message.role === "assistant" &&
        "function_calls" in message &&
        message.function_calls.length > 0
      ) {
        lastAgentMessageIndex = i;
        break;
      }
    }

    if (lastAgentMessageIndex >= 0) {
      // Try progressive tool output truncation
      const truncationResult = await tryToolOutputTruncation(
        messages,
        messagesCount,
        lastAgentMessageIndex,
        model,
        allowedTokenCount,
        promptCount +
          Math.floor(
            toolDefinitionsCount * toolDefinitionsCountAdjustmentFactor
          ) +
          tokensMargin,
        conversation
      );

      if (truncationResult.selected.length > 0) {
        return new Ok({
          modelConversation: {
            messages: truncationResult.selected,
          },
          tokensUsed: truncationResult.tokensUsed,
        });
      }
    }
  }

  // Log warning if we end up with 0 messages
  if (selected.length === 0) {
    logger.warn(
      {
        workspaceId: conversation.owner.sId,
        conversationId: conversation.sId,
        totalMessages: messages.length,
        modelContextSize: model.contextSize,
        promptTokens: promptCount,
        toolDefinitionsTokens: Math.floor(
          toolDefinitionsCount * toolDefinitionsCountAdjustmentFactor
        ),
        tokensMargin,
        allowedTokenCount,
      },
      "[CONTEXT_WINDOW_OVERFLOW] No messages could fit within the context window"
    );
  }

  return new Ok({
    modelConversation: {
      messages: selected,
    },
    tokensUsed,
  });
}

/**
 * Helper function to calculate the size of tool output content
 */
function getToolOutputSize(
  content: string | (TextContent | ImageContent)[]
): number {
  if (typeof content === "string") {
    return content.length;
  }

  return content.reduce((acc, item) => {
    if (isTextContent(item)) {
      return acc + (item.text?.length ?? 0);
    } else if (isImageContent(item)) {
      // Estimate image size from URL length (base64 or reference)
      return acc + (item.image_url.url?.length ?? 0);
    } else {
      assertNever(item);
    }
  }, 0);
}

/**
 * Attempts to truncate tool outputs progressively to fit within token limits
 */
async function tryToolOutputTruncation(
  messages: ModelMessageTypeMultiActions[],
  originalTokenCounts: number[],
  lastAgentMessageIndex: number,
  model: ModelConfigurationType,
  allowedTokenCount: number,
  initialTokensUsed: number,
  conversation: ConversationType
): Promise<{
  selected: ModelMessageTypeMultiActions[];
  tokensUsed: number;
}> {
  const truncationMessage =
    "[THE CONTEXT WINDOW IS OVERLOADED, THIS TOOL OUTPUT CAN'T BE RENDERED]";

  // Find all function messages after the last agent message
  const toolOutputs: Array<{
    messageIndex: number;
    originalContent: string | (TextContent | ImageContent)[];
    size: number;
  }> = [];

  let i = lastAgentMessageIndex + 1;
  while (i < messages.length && messages[i].role === "function") {
    const functionMessage = messages[i] as FunctionMessageTypeModel;
    toolOutputs.push({
      messageIndex: i,
      originalContent: functionMessage.content,
      size: getToolOutputSize(functionMessage.content),
    });
    i++;
  }

  if (toolOutputs.length === 0) {
    return { selected: [], tokensUsed: 0 };
  }

  // Sort by size (largest first)
  toolOutputs.sort((a, b) => b.size - a.size);

  // Clone messages and token counts for modification
  const modifiedMessages = [...messages];
  const modifiedTokenCounts = [...originalTokenCounts];

  // Try truncating tool outputs one by one
  for (
    let truncateCount = 1;
    truncateCount <= toolOutputs.length;
    truncateCount++
  ) {
    // Truncate the next largest tool output
    const toolOutput = toolOutputs[truncateCount - 1];
    modifiedMessages[toolOutput.messageIndex] = {
      ...modifiedMessages[toolOutput.messageIndex],
      content: truncationMessage,
    } as FunctionMessageTypeModel;

    // Recalculate token count for the truncated message
    const truncatedText = getTextRepresentationFromMessages([
      modifiedMessages[toolOutput.messageIndex],
    ])[0];
    const tokenResult = await tokenCountForTexts([truncatedText], model);
    if (tokenResult.isErr()) {
      continue;
    }
    modifiedTokenCounts[toolOutput.messageIndex] = tokenResult.value[0];

    // Try selection with modified token counts
    const { selected, tokensUsed } = performMessageSelection(
      modifiedMessages,
      modifiedTokenCounts,
      allowedTokenCount,
      initialTokensUsed
    );

    // Apply post-processing
    const postProcessed = postProcessSelectedMessages(
      selected,
      modifiedTokenCounts,
      modifiedMessages.length,
      conversation,
      tokensUsed
    );

    if (postProcessed.selected.length > 0) {
      // Log warning about truncated tool outputs
      logger.warn(
        {
          workspaceId: conversation.owner.sId,
          conversationId: conversation.sId,
          agentMessageIndex: lastAgentMessageIndex,
          totalToolOutputs: toolOutputs.length,
          modelContextSize: model.contextSize,
        },
        "[TOOL_OUTPUT_TRUNCATION] Tool outputs were truncated to fit within context window"
      );

      return postProcessed;
    }
  }

  return { selected: [], tokensUsed: 0 };
}

/**
 * Performs the backward message selection algorithm
 */
function performMessageSelection(
  messages: ModelMessageTypeMultiActions[],
  messagesCount: number[],
  allowedTokenCount: number,
  initialTokensUsed: number
): { selected: ModelMessageTypeMultiActions[]; tokensUsed: number } {
  const selected: ModelMessageTypeMultiActions[] = [];
  let tokensUsed = initialTokensUsed;

  // Go backward and accumulate as much as we can within allowedTokenCount
  for (let i = messages.length - 1; i >= 0; i--) {
    const tokenCount = messagesCount[i];
    const currentMessage = messages[i];

    if (tokensUsed + tokenCount <= allowedTokenCount) {
      tokensUsed += tokenCount;
      selected.unshift(currentMessage);
    } else {
      break;
    }
  }

  return { selected, tokensUsed };
}

/**
 * Post-processes selected messages: merges content fragments and removes leading assistant/function messages
 */
function postProcessSelectedMessages(
  selected: ModelMessageTypeMultiActions[],
  messagesCount: number[],
  totalMessagesLength: number,
  conversation: ConversationType,
  tokensUsed: number
): { selected: ModelMessageTypeMultiActions[]; tokensUsed: number } {
  // Clone to avoid mutation
  const processed = [...selected];
  let updatedTokensUsed = tokensUsed;

  // Merge content fragments into user messages
  for (let i = processed.length - 1; i >= 0; i--) {
    const cfMessage = processed[i];
    if (isContentFragmentMessageTypeModel(cfMessage)) {
      const userMessage = processed[i + 1];
      if (!userMessage || userMessage.role !== "user") {
        logger.error(
          {
            workspaceId: conversation.owner.sId,
            conversationId: conversation.sId,
            selected: processed.map((m) => ({
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
      processed.splice(i, 1);
    }
  }

  // Remove leading assistant/function messages
  while (
    processed.length > 0 &&
    ["assistant", "function"].includes(processed[0].role)
  ) {
    // Find the index of the first selected message in the original messages array
    const firstSelectedIndex = totalMessagesLength - selected.length;
    const removedIndex =
      firstSelectedIndex + (selected.length - processed.length);
    const tokenCount = messagesCount[removedIndex];
    updatedTokensUsed -= tokenCount;
    processed.shift();
  }

  return { selected: processed, tokensUsed: updatedTokensUsed };
}
