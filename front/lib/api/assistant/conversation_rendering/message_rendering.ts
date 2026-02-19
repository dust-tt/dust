/**
 * Message rendering logic shared between legacy and enhanced implementations
 */

import type { Step } from "@app/lib/api/assistant/conversation_rendering/helpers";
import {
  getSteps,
  renderContentFragment,
  renderOtherAgentMessageAsUserMessage,
  renderUserMessage,
} from "@app/lib/api/assistant/conversation_rendering/helpers";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { AgentTextContentType } from "@app/types/assistant/agent_message_content";
import type {
  AgentMessageType,
  ConversationType,
} from "@app/types/assistant/conversation";
import {
  isAgentMessageType,
  isUserMessageType,
} from "@app/types/assistant/conversation";
import type {
  AssistantContentMessageTypeModel,
  AssistantFunctionCallMessageTypeModel,
  ModelMessageTypeMultiActions,
} from "@app/types/assistant/generation";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import { isContentFragmentType } from "@app/types/content_fragment";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { assertNever } from "@app/types/shared/utils/assert_never";

/**
 * Renders agent message steps into model messages
 */
export function renderAgentSteps(
  steps: Step[],
  message: AgentMessageType,
  conversation: ConversationType,
  excludeActions: boolean
): ModelMessageTypeMultiActions[] {
  const messages: ModelMessageTypeMultiActions[] = [];

  if (excludeActions) {
    // In Exclude Actions mode, we only render the last step that has text content.
    const stepsWithContent = steps.filter((s) =>
      s?.contents.some((c) => c.type === "text_content")
    );
    if (stepsWithContent.length) {
      const lastStepWithContent = stepsWithContent[stepsWithContent.length - 1];
      const textContents: AgentTextContentType[] = [];
      for (const content of lastStepWithContent.contents) {
        if (content.type === "text_content") {
          textContents.push(content);
        }
      }
      // Filter out function_call contents since we're not including their outputs.
      // Including function_calls without outputs causes OpenAI's responses API to error.
      const filteredContents = lastStepWithContent.contents.filter(
        (c) => c.type !== "function_call"
      );
      messages.push({
        role: "assistant",
        name: message.configuration.name,
        content: textContents.map((c) => c.value).join("\n"),
        contents: filteredContents,
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
      const textContents: AgentTextContentType[] = [];
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

  return messages;
}

/**
 * Renders all conversation messages into model messages
 *
 * When `agentConfiguration` is provided and the `agent_bound_loop_rendering` feature flag
 * is enabled, agent messages from other agents are rendered as user messages with system tags,
 * showing only the final output (not the full agentic loop).
 */
export async function renderAllMessages(
  auth: Authenticator,
  {
    conversation,
    model,
    excludeActions,
    excludeImages,
    onMissingAction,
    agentConfiguration,
    featureFlags,
  }: {
    conversation: ConversationType;
    model: ModelConfigurationType;
    excludeActions?: boolean;
    excludeImages?: boolean;
    onMissingAction: "inject-placeholder" | "skip";
    agentConfiguration?: AgentConfigurationType;
    featureFlags?: WhitelistableFeature[];
  }
): Promise<ModelMessageTypeMultiActions[]> {
  const messages: ModelMessageTypeMultiActions[] = [];

  const agentBoundLoopRendering =
    featureFlags?.includes("agent_bound_loop_rendering") ?? false;

  // Render loop: render all messages and all actions.
  for (const versions of conversation.content) {
    const m = versions[versions.length - 1];

    if (isAgentMessageType(m)) {
      if (m.visibility === "visible") {
        // When agent_bound_loop_rendering is enabled, check if this is the current agent's message.
        const isCurrentAgentMessage =
          !agentBoundLoopRendering ||
          !agentConfiguration ||
          m.configuration.sId === agentConfiguration.sId;

        if (isCurrentAgentMessage) {
          // Render the current agent's messages normally with full agentic loop.
          const steps = getSteps(auth, {
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
        } else {
          // Render other agent messages as user messages with system tags, showing only the final
          // output (not the full agentic loop).
          const userMessage = renderOtherAgentMessageAsUserMessage(m);
          if (userMessage) {
            messages.push(userMessage);
          }
        }
      }
    } else if (isUserMessageType(m)) {
      if (m.visibility === "visible") {
        messages.push(renderUserMessage(conversation, m));
      }
    } else if (isContentFragmentType(m)) {
      if (m.visibility === "visible") {
        const renderedContentFragment = await renderContentFragment(
          auth,
          m,
          model,
          !!excludeImages
        );
        if (renderedContentFragment) {
          messages.push(renderedContentFragment);
        }
      }
    } else {
      assertNever(m);
    }
  }

  return messages;
}
