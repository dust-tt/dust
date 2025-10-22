/**
 * Common shared functions for conversation rendering
 * These functions are used by both legacy and enhanced implementations
 */

import { isTextContent } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { rewriteContentForModel } from "@app/lib/actions/mcp_utils";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { renderLightContentFragmentForModel } from "@app/lib/resources/content_fragment_resource";
import logger from "@app/logger/logger";
import type {
  AgentMessageType,
  ConversationType,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelConfigurationType,
  ModelMessageTypeMultiActions,
  UserMessageType,
  UserMessageTypeModel,
} from "@app/types";
import { removeNulls } from "@app/types";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type {
  AgentContentItemType,
  ErrorContentType,
} from "@app/types/assistant/agent_message_content";

/**
 * Type for a step in agent message processing
 */
export type Step = {
  contents: Exclude<AgentContentItemType, ErrorContentType>[];
  actions: {
    call: FunctionCallType;
    result: FunctionMessageTypeModel;
  }[];
};

/**
 * Renders an action result for multi-actions model
 */
export function renderActionForMultiActionsModel(
  action: AgentMCPActionWithOutputType
): FunctionMessageTypeModel {
  if (action.status === "denied") {
    return {
      role: "function" as const,
      name: action.functionCallName,
      function_call_id: action.functionCallId,
      content:
        "The user rejected this specific action execution. Using this action is hence forbidden for this message.",
    };
  }

  const outputItems = removeNulls(
    action.output?.map(rewriteContentForModel) ?? []
  );

  let output;
  if (outputItems.length === 0) {
    output = "Successfully executed action, no output.";
  } else if (outputItems.every((item) => isTextContent(item))) {
    output = outputItems.map((item) => item.text).join("\n");
  } else {
    output = JSON.stringify(outputItems);
  }

  return {
    role: "function" as const,
    name: action.functionCallName,
    function_call_id: action.functionCallId,
    content: output,
  };
}

/**
 * Processes agent message steps
 */
export async function getSteps(
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
      call: {
        id: action.functionCallId,
        name: action.functionCallName,
        arguments: JSON.stringify(action.params),
      },
      result: renderActionForMultiActionsModel(action),
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

/**
 * Renders a user message with metadata
 */
export function renderUserMessage(m: UserMessageType): UserMessageTypeModel {
  // Replace all `:mention[{name}]{.*}` with `@name`.
  const content = m.content.replaceAll(
    /:mention\[([^\]]+)\]\{[^}]+\}/g,
    (_, name) => {
      return `@${name}`;
    }
  );

  const metadataItems: string[] = [];

  const identityTokens: string[] = [];
  if (m.context.fullName) {
    identityTokens.push(m.context.fullName);
  }
  if (m.context.username) {
    const usernameToken = m.context.fullName
      ? `(@${m.context.username})`
      : `@${m.context.username}`;
    identityTokens.push(usernameToken);
  }
  if (m.context.email) {
    identityTokens.push(`<${m.context.email}>`);
  }
  if (identityTokens.length > 0) {
    metadataItems.push(`- Sender: ${identityTokens.join(" ")}`);
  }

  const timeZone =
    m.context.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const formatWithTimeZone = (date: Date) =>
    date.toLocaleString(undefined, {
      timeZone,
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
      hour12: false,
    });

  if (m.created) {
    metadataItems.push(`- Sent at: ${formatWithTimeZone(new Date(m.created))}`);
  }

  if (m.context.origin === "triggered") {
    metadataItems.push("- Source: Scheduled trigger");
    if (m.context.lastTriggerRunAt) {
      metadataItems.push(
        `- Previous scheduled run: ${formatWithTimeZone(
          new Date(m.context.lastTriggerRunAt)
        )}`
      );
    }
  } else if (m.context.origin) {
    metadataItems.push(`- Source: ${m.context.origin}`);
  }

  let systemContext = "";
  if (metadataItems.length > 0) {
    systemContext = `<dust_system>\n${metadataItems.join("\n")}\n</dust_system>\n\n`;
  }

  return {
    role: "user" as const,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    name: m.context.fullName || m.context.username,
    content: [
      {
        type: "text",
        text: systemContext + content,
      },
    ],
  };
}

/**
 * Renders a content fragment message
 */
export async function renderContentFragment(
  auth: Authenticator,
  m: any, // ContentFragmentType
  conversation: ConversationType,
  model: ModelConfigurationType,
  excludeImages: boolean
): Promise<ModelMessageTypeMultiActions | null> {
  const renderedContentFragment = await renderLightContentFragmentForModel(
    auth,
    m,
    conversation,
    model,
    {
      excludeImages: Boolean(excludeImages),
    }
  );
  return renderedContentFragment;
}
