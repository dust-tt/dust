import {
  getTextContentFromMessage,
  getTextRepresentationFromMessages,
} from "@app/lib/api/assistant/utils";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { renderLightContentFragmentForModel } from "@app/lib/resources/content_fragment_resource";
import { tokenCountForTexts } from "@app/lib/tokenization";
import logger from "@app/logger/logger";
import mcp from "@app/pages/api/w/[wId]/mcp";
import type {
  AgentMessageType,
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
    onMissingAction = "inject-placeholder",
  }: {
    conversation: ConversationType;
    model: ModelConfigurationType;
    prompt: string;
    tools: string;
    allowedTokenCount: number;
    excludeActions?: boolean;
    excludeImages?: boolean;
    onMissingAction?: "inject-placeholder" | "skip";
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
  const now = Date.now();
  const messages: ModelMessageTypeMultiActions[] = [];

  // Render loop: render all messages and all actions.
  for (const versions of conversation.content) {
    const m = versions[versions.length - 1];

    if (isAgentMessageType(m)) {
      const steps = await getSteps(auth, {
        model,
        message: m,
        workspaceId: conversation.owner.sId,
        conversationId: conversation.sId,
        onMissingAction,
      });

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

      console.log(m);

      let systemContext = "";
      if (m.context.origin === "triggered") {
        const items = [];
        if (m.created) {
          items.push(`- Current date: ${new Date(m.created).toISOString()}`);
        }
        if (m.context.lastTriggeredRunAt) {
          items.push(
            `- Last scheduled run: ${m.context.lastTriggeredRunAt.toISOString()}`
          );
        }
        if (items.length > 0) {
          systemContext = `<dust_system>\n${items.join("\n")}\n</dust_system>\n\n`;
        }
      }

      messages.push({
        role: "user" as const,
        name: m.context.fullName || m.context.username,
        content: [
          {
            type: "text",
            text: systemContext + content,
          },
        ],
      });
    } else if (isContentFragmentType(m)) {
      const renderedContentFragment = await renderLightContentFragmentForModel(
        auth,
        m,
        conversation,
        model,
        {
          excludeImages: Boolean(excludeImages),
        }
      );
      if (renderedContentFragment) {
        messages.push(renderedContentFragment);
      }
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

  if (selected.length === 0) {
    return new Err(
      new Error("Context window exceeded: at least one message is required")
    );
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

type Step = {
  contents: Array<Exclude<AgentContentItemType, ErrorContentType>>;
  actions: Array<{
    call: FunctionCallType;
    result: FunctionMessageTypeModel;
  }>;
};

async function getSteps(
  auth: Authenticator,
  {
    model,
    message,
    workspaceId,
    conversationId,
    onMissingAction,
  }: {
    model: ModelConfigurationType;
    message: AgentMessageType;
    workspaceId: string;
    conversationId: string;
    onMissingAction: "inject-placeholder" | "skip";
  }
): Promise<Step[]> {
  const supportedModel = getSupportedModelConfig(model);
  const actions = removeNulls(message.actions);

  // We store for each step (identified by its index) the "contents" array (raw model outputs, including
  // text content, reasoning and function calls) and "actions", i.e the function results.
  const stepByStepIndex = {} as Record<number, Step>;

  const emptyStep = (): Step =>
    ({
      contents: [],
      actions: [],
    }) satisfies Step;

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

  for (const content of message.contents) {
    if (content.content.type === "error") {
      // Don't render error content.
      logger.warn(
        {
          workspaceId,
          conversationId,
          agentMessageId: message.sId,
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

  return (
    Object.entries(stepByStepIndex)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, step]) => step)
      // This is a hack to avoid errors when rendering conversations that are in a corrupted state
      // (some content is saved but tool was never executed)
      // For each step, we look at the contents to find the function calls.
      // If some function calls have no associated function result, we make a dummy "errored" one.
      .map((step) => {
        if (onMissingAction !== "inject-placeholder") {
          return step;
        }

        const actions = step.actions;
        const functionResultByCallId = Object.fromEntries(
          step.actions.map((action) => [action.call.id, action.result])
        );
        for (const content of step.contents) {
          if (content.type === "function_call") {
            const functionCall = content.value;
            if (!functionResultByCallId[functionCall.id]) {
              logger.warn(
                {
                  workspaceId,
                  conversationId,
                  agentMessageId: message.sId,
                  functionCallId: functionCall.id,
                },
                "Unexpected state, agent message step with no action for function call"
              );
              actions.push({
                call: functionCall,
                result: {
                  role: "function",
                  name: functionCall.name,
                  function_call_id: functionCall.id,
                  content: "Error: tool execution failed",
                },
              });
            }
          }
        }
        return { ...step, actions };
      })
      .filter((step) => {
        if (onMissingAction !== "skip") {
          return true;
        }

        const functionResultByCallId = Object.fromEntries(
          step.actions.map((action) => [action.call.id, action.result])
        );
        return step.contents.every(
          (content) =>
            content.type !== "function_call" ||
            functionResultByCallId[content.value.id]
        );
      })
  );
}
