/**
 * Message rendering logic shared between legacy and enhanced implementations
 */

import type { Step } from "@app/lib/api/assistant/conversation_rendering/helpers";
import {
  getSteps,
  renderContentFragment,
  renderUserMessage,
} from "@app/lib/api/assistant/conversation_rendering/helpers";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type {
  AgentMessageType,
  AssistantContentMessageTypeModel,
  AssistantFunctionCallMessageTypeModel,
  ConversationType,
  MessageTypeMultiActions,
  ModelConfigurationType,
} from "@app/types";
import {
  assertNever,
  isAgentMessageType,
  isContentFragmentType,
  isUserMessageType,
} from "@app/types";
import type { TextContentType } from "@app/types/assistant/agent_message_content";

/**
 * Renders agent message steps into model messages
 */
export function renderAgentSteps(
  steps: Step[],
  message: AgentMessageType,
  conversation: ConversationType,
  excludeActions: boolean
): MessageTypeMultiActions[] {
  const messages: MessageTypeMultiActions[] = [];

  if (excludeActions) {
    // In Exclude Actions mode, we only render the last step that has text content.
    const stepsWithContent = steps.filter((s) =>
      s?.contents.some((c) => c.type === "text_content")
    );
    if (stepsWithContent.length) {
      const lastStepWithContent = stepsWithContent[stepsWithContent.length - 1];
      const textContents: TextContentType[] = [];
      for (const content of lastStepWithContent.contents) {
        if (content.type === "text_content") {
          textContents.push(content);
        }
      }
      messages.push({
        role: "assistant",
        name: message.configuration.name,
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
            agentMessageId: message.sId,
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
            agentMessageId: message.sId,
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
          name: message.configuration.name,
          contents: step.contents,
        } satisfies AssistantContentMessageTypeModel);
      }

      for (const { result } of step.actions) {
        messages.push(result);
      }
    }
  }

  // Legacy agent message support
  if (!message.rawContents.length && message.content?.trim()) {
    messages.push({
      role: "assistant",
      name: message.configuration.name,
      content: message.content,
    });
  }

  return messages;
}

/**
 * Renders all conversation messages into model messages
 */
export async function renderAllMessages(
  auth: Authenticator,
  {
    conversation,
    model,
    excludeActions,
    excludeImages,
    onMissingAction,
  }: {
    conversation: ConversationType;
    model: ModelConfigurationType;
    excludeActions?: boolean;
    excludeImages?: boolean;
    onMissingAction: "inject-placeholder" | "skip";
  }
): Promise<MessageTypeMultiActions[]> {
  const messages: MessageTypeMultiActions[] = [];

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

      const agentMessages = renderAgentSteps(
        steps,
        m,
        conversation,
        !!excludeActions
      );
      messages.push(...agentMessages);
    } else if (isUserMessageType(m)) {
      messages.push(renderUserMessage(m));
    } else if (isContentFragmentType(m)) {
      const renderedContentFragment = await renderContentFragment(
        auth,
        m,
        conversation,
        model,
        !!excludeImages
      );
      if (renderedContentFragment) {
        messages.push(renderedContentFragment);
      }
    } else {
      assertNever(m);
    }
  }

  return messages;
}
