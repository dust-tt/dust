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
  ModelConfigurationType,
  ModelConversationTypeMultiActions,
  ModelMessageTypeMultiActions,
  Result,
} from "@app/types";
import {
  assertNever,
  Err,
  isAgentMessageType,
  isContentFragmentMessageTypeModel,
  isContentFragmentType,
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
            // Validate that all actions have results before pushing messages.
            const actionsWithMissingResults = step.actions.filter(
              (action) => !action.result
            );

            if (actionsWithMissingResults.length > 0) {
              logger.error(
                {
                  workspaceId: conversation.owner.sId,
                  conversationId: conversation.sId,
                  agentMessageId: m.sId,
                  missingResultCount: actionsWithMissingResults.length,
                  actionIds: actionsWithMissingResults.map((a) => a.call.id),
                },
                "Agent message has actions without corresponding results"
              );
              // Skip this step to avoid Provider API error.
              continue;
            }

            // Validate that function_call_ids match between calls and results
            const mismatchedIds = step.actions.filter(
              (action) => action.result && action.call.id !== action.result.function_call_id
            );
            
            if (mismatchedIds.length > 0) {
              logger.error(
                {
                  workspaceId: conversation.owner.sId,
                  conversationId: conversation.sId,
                  agentMessageId: m.sId,
                  mismatchedCount: mismatchedIds.length,
                  mismatches: mismatchedIds.map((a) => ({
                    callId: a.call.id,
                    resultId: a.result?.function_call_id,
                  })),
                },
                "Function call IDs don't match between calls and results"
              );
            }

            messages.push({
              role: "assistant",
              function_calls: step.actions.map((s) => s.call),
              content: textContents.map((c) => c.value).join("\n"),
              contents: step.contents,
            } satisfies AssistantFunctionCallMessageTypeModel);

            // Push all results immediately after function calls
            for (const action of step.actions) {
              if (!action.result) {
                // This shouldn't happen due to validation above, but log if it does
                logger.error(
                  {
                    workspaceId: conversation.owner.sId,
                    conversationId: conversation.sId,
                    agentMessageId: m.sId,
                    actionCallId: action.call.id,
                    actionName: action.call.name,
                  },
                  "Attempting to push null result for action"
                );
                continue;
              }
              messages.push(action.result);
            }
          } else {
            messages.push({
              role: "assistant",
              content: textContents.map((c) => c.value).join("\n"),
              name: m.configuration.name,
              contents: step.contents,
            } satisfies AssistantContentMessageTypeModel);
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

  // Go backward and accumulate as much as we can within allowedTokenCount.
  const selected: ModelMessageTypeMultiActions[] = [];

  // Selection loop.
  for (let i = messages.length - 1; i >= 0; i--) {
    const c = messagesCount[i];

    const currentMessage = messages[i];

    if (tokensUsed + c <= allowedTokenCount) {
      tokensUsed += c;
      selected.unshift(currentMessage);
    } else {
      break;
    }
  }

  // Merging loop: merging content fragments into the upcoming user message.
  // Eg: [CF1, CF2, UserMessage, AgentMessage] => [CF1-CF2-UserMessage, AgentMessage]
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
      // Now we remove the content fragment from the array since it was merged into the upcoming
      // user message.
      selected.splice(i, 1);
    }
  }

  while (
    selected.length > 0 &&
    // Most model providers don't support starting by a function result or agent message.
    ["assistant", "function"].includes(selected[0].role)
  ) {
    const tokenCount = messagesCount[messages.length - selected.length];
    tokensUsed -= tokenCount;
    selected.shift();
  }

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

  return new Ok({
    modelConversation: {
      messages: selected,
    },
    tokensUsed,
  });
}
