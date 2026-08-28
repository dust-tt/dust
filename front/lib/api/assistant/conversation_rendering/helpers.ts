/**
 * Common shared functions for conversation rendering
 * These functions are used by both legacy and enhanced implementations
 */

import {
  isModelVisionImage,
  isTextContent,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { rewriteContentForModel } from "@app/lib/actions/mcp_utils";
import { getEnableSkillIdFromOutputBlock } from "@app/lib/api/actions/servers/skill_management/rendering";
import type { EnabledSkill } from "@app/lib/api/assistant/skills_rendering";
import { renderEnabledSkillUserMessageFromInstructions } from "@app/lib/api/assistant/skills_rendering";
import { DustFileSystem } from "@app/lib/api/file_system";
import { getConversationFileMountSignedUrl } from "@app/lib/api/files/gcs_mount/files";
import type { Authenticator } from "@app/lib/auth";
import { MODEL_INPUT_SIGNED_URL_EXPIRATION_DELAY_MS } from "@app/lib/file_storage/signed_url_cache";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import {
  replaceMentionsWithAt,
  serializeMention,
} from "@app/lib/mentions/format";
import { renderLightContentFragmentForModel } from "@app/lib/resources/content_fragment_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type { AttachmentCapabilityContext } from "@app/types/api/assistant/conversation/attachments";
import type {
  AgentContentItemType,
  AgentErrorContentType,
} from "@app/types/assistant/agent_message_content";
import type {
  AgentMessageType,
  CompactionMessageType,
  ConversationWithoutContentType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import type {
  CompactionMessageTypeModel,
  Content,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelMessageTypeMultiActions,
  UserMessageTypeModel,
} from "@app/types/assistant/generation";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import { removeNulls } from "@app/types/shared/utils/general";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const RENDER_ACTIONS_CONCURRENCY = 5;

/**
 * Drops the internal "type": "resource" wrapper and the top-level mimeType discriminator from a
 * resource-shaped tool output item before it's serialized for the model. Every resource schema's
 * mimeType is a fixed literal used only to distinguish shapes in our own code (see
 * output_schemas.ts); it's never a real content type, and never what the model reads. Other item
 * types (text, image) are returned unchanged.
 */
function compactResourceItem(item: CallToolResult["content"][number]) {
  if (item.type !== "resource") {
    return item;
  }
  const { mimeType: _mimeType, ...resource } = item.resource;
  return resource;
}

// The fixed notice the model sees for an action that did not run (denied or blocked), or null when
// the action executed and its output should be rendered instead.
function toolResultStatusNotice(
  status: AgentMCPActionWithOutputType["status"]
): string | null {
  switch (status) {
    case "denied":
      return "The user rejected or skipped this specific action execution. Using this action is hence forbidden for this message.";

    case "blocked_authentication_required":
      return "The user must manually authenticate to use this action before it can be executed.";

    case "blocked_validation_required":
    case "blocked_child_action_input_required":
      return "The user must manually validate this action before it can be executed.";

    default:
      return null;
  }
}

/**
 * The model-visible text of a tool result: the status notice for actions that did not run, otherwise
 * the executed output serialized as text. This is the single source of truth for how a tool result
 * reads to the model, shared by conversation rendering and consumption attribution so the two never
 * drift.
 *
 * Image content is not represented here. Vision-capable rendering emits images as a structured
 * payload alongside the text (see renderActionForMultiActionsModel). Every other caller uses the
 * text view this returns, in which a non-text result falls back to its JSON serialization.
 */
export function renderToolResultForModelAsText(
  action: AgentMCPActionWithOutputType,
  capabilities: AttachmentCapabilityContext
): string {
  const notice = toolResultStatusNotice(action.status);
  if (notice !== null) {
    return notice;
  }

  const outputItems = removeNulls(
    action.output?.map((content) =>
      rewriteContentForModel(content, capabilities)
    ) ?? []
  );
  if (outputItems.length === 0) {
    return "Successfully executed action, no output.";
  }

  if (outputItems.every((item) => isTextContent(item))) {
    return outputItems.map((item) => item.text).join("\n");
  }

  return JSON.stringify(outputItems.map(compactResourceItem));
}

async function getDustFileSystemDownloadUrl(
  auth: Authenticator,
  filePath: string
) {
  const fsResult = await DustFileSystem.fromScopedPath(auth, filePath);
  if (fsResult.isErr()) {
    return fsResult;
  }

  return fsResult.value.getDownloadUrl(filePath, {
    expiresInMs: MODEL_INPUT_SIGNED_URL_EXPIRATION_DELAY_MS,
  });
}

/**
 * Type for a step in agent message processing
 */
export type Step = {
  contents: Exclude<AgentContentItemType, AgentErrorContentType>[];
  actions: {
    call: FunctionCallType;
    result: FunctionMessageTypeModel;
    enabledSkillMessages: UserMessageTypeModel[];
  }[];
};

function formatToolInputValueForModel(value: unknown): string {
  return JSON.stringify(value);
}

function renderUserEditedInputsNote(
  action: AgentMCPActionWithOutputType
): string | null {
  if (!action.userEditedInputs) {
    return null;
  }

  const editedInputLines = Object.entries(action.userEditedInputs)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `- ${key}: ${formatToolInputValueForModel(value)}`);
  if (editedInputLines.length === 0) {
    return null;
  }

  return `The tool was executed with these user-edited input values:\n${editedInputLines.join("\n")}.`;
}

function renderEnabledSkillMessagesForAction(
  action: AgentMCPActionWithOutputType,
  {
    enabledSkillById,
  }: {
    enabledSkillById: ReadonlyMap<string, EnabledSkill>;
  }
): UserMessageTypeModel[] {
  const enabledSkillMessages: UserMessageTypeModel[] = [];

  for (const outputBlock of action.output ?? []) {
    const skillId = getEnableSkillIdFromOutputBlock(outputBlock);
    if (!skillId) {
      continue;
    }

    const skill = enabledSkillById.get(skillId);
    if (!skill) {
      continue;
    }

    enabledSkillMessages.push(
      renderEnabledSkillUserMessageFromInstructions({
        skill,
      })
    );
  }

  return enabledSkillMessages;
}

/**
 * Renders an action result for multi-actions model
 */
async function renderActionForMultiActionsModel(
  auth: Authenticator,
  action: AgentMCPActionWithOutputType,
  model: ModelConfigurationType,
  {
    conversationId,
    capabilities,
  }: {
    conversationId: string;
    capabilities: AttachmentCapabilityContext;
  }
): Promise<FunctionMessageTypeModel> {
  const notice = toolResultStatusNotice(action.status);
  if (notice !== null) {
    return {
      role: "function" as const,
      name: action.functionCallName,
      function_call_id: action.functionCallId,
      content: notice,
    };
  }

  const outputItems = removeNulls(
    action.output?.map((content) =>
      rewriteContentForModel(content, capabilities)
    ) ?? []
  );

  // When the user edited the tool inputs before approving, the result is prepended with a note so
  // the model knows which input values the tool actually ran with.
  const editedInputsNote = renderUserEditedInputsNote(action);

  // Vision-capable models receive images as a structured payload with the text interleaved. This is
  // the one case that needs async signed URLs, so it stays here rather than in the shared text view.
  // Every other case delegates to renderToolResultForModelAsText below.
  if (
    model.supportsVision &&
    outputItems.some((item) => isModelVisionImage(item))
  ) {
    const contentArray: Content[] = editedInputsNote
      ? [{ type: "text", text: editedInputsNote }]
      : [];
    for (const item of outputItems) {
      if (isTextContent(item)) {
        contentArray.push({ type: "text", text: item.text });
      } else if (isModelVisionImage(item)) {
        // @ts-ignore gcsPath is the legacy field.
        const { gcsPath, filePath } = item.resource;

        const path = filePath || gcsPath;

        // Legacy records carry a raw GCS path (starts with `w/`).
        // New records carry a canonical scoped path (e.g. `conversation-{cId}/photo.png`).
        const urlRes = path.startsWith("w/")
          ? await getConversationFileMountSignedUrl(
              auth,
              { useCase: "conversation", conversationId },
              path
            )
          : await getDustFileSystemDownloadUrl(auth, path);

        if (urlRes.isOk()) {
          contentArray.push({
            type: "image_url",
            image_url: { url: urlRes.value },
          });
        } else {
          contentArray.push({
            type: "text",
            text: `[Image unavailable: ${urlRes.error.message}]`,
          });
        }
      }
    }
    return {
      role: "function" as const,
      name: action.functionCallName,
      function_call_id: action.functionCallId,
      content: contentArray,
    };
  }

  const resultText = renderToolResultForModelAsText(action, capabilities);

  return {
    role: "function" as const,
    name: action.functionCallName,
    function_call_id: action.functionCallId,
    content: editedInputsNote
      ? `${editedInputsNote}\n${resultText}`
      : resultText,
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
    enabledSkillById,
    capabilities,
  }: {
    model: ModelConfigurationType;
    message: AgentMessageType;
    workspaceId: string;
    conversationId: string;
    onMissingAction: "inject-placeholder" | "skip";
    enabledSkillById: ReadonlyMap<string, EnabledSkill>;
    capabilities: AttachmentCapabilityContext;
  }
): Promise<Step[]> {
  const supportedModel = getSupportedModelConfig(model);
  if (!supportedModel) {
    return [];
  }
  const actions = removeNulls(message.actions);

  // We store for each step (identified by its index) the "contents" array (raw model outputs, including
  // text content, reasoning and function calls) and "actions", i.e the function results.
  const stepByStepIndex = {} as Record<number, Step>;

  const emptyStep = (): Step =>
    ({
      contents: [],
      actions: [],
    }) satisfies Step;

  const renderedActions = await concurrentExecutor(
    actions,
    async (action) => ({
      action,
      result: await renderActionForMultiActionsModel(auth, action, model, {
        conversationId,
        capabilities,
      }),
      enabledSkillMessages: renderEnabledSkillMessagesForAction(action, {
        enabledSkillById,
      }),
    }),
    { concurrency: RENDER_ACTIONS_CONCURRENCY }
  );

  for (const { action, result, enabledSkillMessages } of renderedActions) {
    const stepIndex = action.step;
    stepByStepIndex[stepIndex] = stepByStepIndex[stepIndex] || emptyStep();
    stepByStepIndex[stepIndex].actions.push({
      call: {
        id: action.functionCallId,
        name: action.functionCallName,
        arguments: JSON.stringify(action.params),
      },
      result,
      enabledSkillMessages,
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
          errorContent: content.content.value,
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
                enabledSkillMessages: [],
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
export function renderUserMessage(
  conversation: ConversationWithoutContentType,
  m: UserMessageType
): UserMessageTypeModel {
  const content = replaceMentionsWithAt(m.content);

  const metadataItems: string[] = [];
  let additionalInstructions = "";

  const identityTokens: string[] = [];
  const fullName = m.user?.fullName ?? m.context.fullName;
  const mention = m.user
    ? serializeMention({
        id: m.user.sId,
        type: "user",
        label: m.user.fullName,
      })
    : m.context.fullName
      ? `@${m.context.fullName}`
      : m.context.username
        ? `@${m.context.username}`
        : null;
  const email = m.user?.email ?? m.context.email;

  if (fullName) {
    identityTokens.push(fullName);
  }
  if (mention) {
    identityTokens.push(`(${mention})`);
  }
  if (email) {
    identityTokens.push(`<${email}>`);
  }

  if (identityTokens.length > 0) {
    metadataItems.push(`- Sender: ${identityTokens.join(" ")}`);
  }

  // TODO(2026-02-01 flav): Move this to another system message.
  metadataItems.push(`- Conversation: ${conversation.sId}`);

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
  } else if (m.context.origin === "system_activation") {
    metadataItems.push("- Source: Activation Pod nudge");
  } else if (m.context.origin) {
    metadataItems.push(`- Source: ${m.context.origin}`);
    if (m.context.origin === "slack") {
      additionalInstructions +=
        "This message originated from Slack: make sure to retrieve the context from the attached thread content.";
    }
    if (["slack", "teams"].includes(m.context.origin)) {
      additionalInstructions +=
        "If you need to ping or mention a user, tag them using @username.";
    }
  }

  const systemContext = [];
  if (metadataItems.length > 0) {
    systemContext.push(`${metadataItems.join("\n")}`);
  }
  if (additionalInstructions.length > 0) {
    systemContext.push(`${additionalInstructions}`);
  }
  const systemContextInstructions =
    systemContext.length > 0
      ? `<dust_system>\n${systemContext.join("\n\n")}\n</dust_system>\n\n`
      : "";

  return {
    role: "user" as const,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    name: m.context.fullName || m.context.username,
    content: [
      {
        type: "text",
        text: systemContextInstructions + content,
      },
    ],
  };
}

/**
 * Renders an agent message from a different agent as a user message with system tags.
 * Only the final text output is rendered, not the full agentic loop (actions/tool calls).
 */
export function renderOtherAgentMessageAsUserMessage(
  message: AgentMessageType
): UserMessageTypeModel | null {
  // Only render if there's actual content
  const content = message.content?.trim();
  if (!content) {
    return null;
  }

  const agentName = message.configuration.name;

  const systemContext = `<dust_system>
This is the output of another invoked agent: "@${agentName}".
You are seeing the final response only, not the full reasoning or tool execution steps.
</dust_system>

`;

  return {
    role: "user" as const,
    name: agentName,
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
  model: ModelConfigurationType,
  {
    excludeImages,
    capabilities,
  }: {
    excludeImages: boolean;
    capabilities: AttachmentCapabilityContext;
  }
): Promise<ModelMessageTypeMultiActions | null> {
  const renderedContentFragment = await renderLightContentFragmentForModel(
    auth,
    m,
    model,
    {
      excludeImages: Boolean(excludeImages),
      capabilities,
    }
  );
  return renderedContentFragment;
}

/**
 * Renders a succeeded compaction message as a model message. The summary is wrapped in
 * <compaction_summary> tags so the model can distinguish it from regular user messages.
 * Returns null for failed or in-progress compactions (they are inert).
 */
export function renderCompactionMessage(
  message: CompactionMessageType
): CompactionMessageTypeModel | null {
  if (message.status !== "succeeded" || !message.content) {
    return null;
  }
  return {
    role: "compaction",
    content: `<dust_system>Context was compacted</dust_system>
<compaction_summary>
${message.content}
</compaction_summary>`,
  };
}
