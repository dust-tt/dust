import type {
  ImageBlockParam,
  MessageParam,
  ServerToolUseBlockParam,
  TextBlockParam,
  ThinkingBlockParam,
  Tool,
  ToolResultBlockParam,
  ToolSearchToolResultBlockParam,
  ToolUseBlockParam,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { ANTHROPIC_PROVIDER_ID } from "@app/lib/api/llm/clients/anthropic/types";
import { parseAnthropicToolSearchBlock } from "@app/lib/api/llm/clients/anthropic/utils/tool_search_passthrough";
import { extractEncryptedContentFromMetadata } from "@app/lib/api/llm/utils";
import { parseToolArguments } from "@app/lib/api/llm/utils/tool_arguments";
import { TOOL_SEARCH_TOOL } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/tool_search";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type {
  AgentFunctionCallContentType,
  AgentProviderPassthroughContentType,
  AgentReasoningContentType,
  AgentTextContentType,
} from "@app/types/assistant/agent_message_content";
import type {
  AssistantContentMessageTypeModel,
  AssistantFunctionCallMessageTypeModel,
  Content,
  FunctionMessageTypeModel,
  ModelMessageTypeMultiActionsWithoutContentFragment,
  UserMessageTypeModel,
} from "@app/types/assistant/generation";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import { trustedFetchImageBase64 } from "@app/types/shared/utils/image_utils";
import assert from "assert";
import compact from "lodash/compact";

const ENABLE_SKILL_FUNCTION_CALL_NAME = "skill_management__enable_skill";

const ACCEPTED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;
type AcceptedMediaType = (typeof ACCEPTED_MEDIA_TYPES)[number];

function isAcceptedMediaType(
  mediaType: string
): mediaType is AcceptedMediaType {
  return ACCEPTED_MEDIA_TYPES.includes(mediaType as AcceptedMediaType);
}

async function userContentToParam(
  content: Content,
  { convertToBase64 }: { convertToBase64?: boolean } = {}
): Promise<TextBlockParam | ImageBlockParam> {
  switch (content.type) {
    case "text":
      return {
        type: "text",
        text: content.text,
      };
    case "image_url":
      if (!convertToBase64) {
        return {
          type: "image",
          source: {
            type: "url",
            url: content.image_url.url,
          },
        };
      }

      let fetchResult: Awaited<ReturnType<typeof trustedFetchImageBase64>>;
      try {
        fetchResult = await trustedFetchImageBase64(content.image_url.url);
      } catch {
        return {
          type: "text",
          text: "Attachment: image could not be loaded.",
        };
      }

      const { mediaType, data } = fetchResult;

      if (!isAcceptedMediaType(mediaType)) {
        return {
          type: "text",
          text: "Attachement: an unsupported media type was provided.",
        };
      }

      return {
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType,
          data,
        },
      };

    default:
      assertNever(content);
  }
}

function assistantContentToParam(
  content:
    | AgentTextContentType
    | AgentReasoningContentType
    | AgentFunctionCallContentType
    | AgentProviderPassthroughContentType,
  omittedThinking: boolean
):
  | TextBlockParam
  | ImageBlockParam
  | ThinkingBlockParam
  | ToolUseBlockParam
  | ServerToolUseBlockParam
  | ToolSearchToolResultBlockParam
  | undefined {
  switch (content.type) {
    case "text_content":
      return {
        type: "text",
        text: content.value,
      };
    case "reasoning":
      if (omittedThinking) {
        return;
      }
      assert(content.value.reasoning, "Reasoning content is missing reasoning");
      const signature = extractEncryptedContentFromMetadata(
        content.value.metadata
      );
      return {
        type: "thinking",
        thinking: content.value.reasoning,
        signature: signature,
      };
    case "function_call": {
      return {
        type: "tool_use",
        id: content.value.id,
        name: content.value.name,
        input: parseToolArguments(content.value.arguments, content.value.name),
      };
    }
    case "provider_passthrough": {
      // Replay the provider's own tool-search blocks verbatim so interleaved
      // thinking signatures stay valid. When thinking is omitted there are no
      // signatures to protect, so drop the server blocks too rather than send
      // them orphaned from the thinking they were emitted with. Also skip blocks
      // tagged for another provider or that fail to parse.
      if (omittedThinking || content.value.provider !== ANTHROPIC_PROVIDER_ID) {
        return undefined;
      }
      return parseAnthropicToolSearchBlock(content.value.block) ?? undefined;
    }
  }
}

async function toolResultToParam(
  message: FunctionMessageTypeModel,
  { convertToBase64 }: { convertToBase64: boolean }
): Promise<ToolResultBlockParam> {
  return {
    type: "tool_result",
    tool_use_id: message.function_call_id,
    content: isString(message.content)
      ? message.content
      : await concurrentExecutor(
          message.content,
          (c) => userContentToParam(c, { convertToBase64 }),
          { concurrency: 10 }
        ),
  };
}

async function functionMessage(
  message: FunctionMessageTypeModel,
  { isLast, convertToBase64 }: { isLast: boolean; convertToBase64: boolean }
): Promise<MessageParam> {
  const toolResult = await toolResultToParam(message, { convertToBase64 });

  // On Vertex the trailing breakpoint must be explicit (isLast is only set
  // there), and tool loops end every iteration on a tool result. Without this
  // marker the conversation tail is reprocessed uncached on each iteration.
  return {
    role: "user",
    content: [
      isLast
        ? { ...toolResult, cache_control: { type: "ephemeral" } }
        : toolResult,
    ],
  };
}

async function userMessage(
  message: UserMessageTypeModel,
  {
    isFirst,
    isLast,
    convertToBase64,
  }: { isFirst: boolean; isLast: boolean; convertToBase64: boolean }
): Promise<MessageParam> {
  const content = await concurrentExecutor(
    message.content,
    (c) => userContentToParam(c, { convertToBase64 }),
    { concurrency: 10 }
  );

  if (content.length > 0) {
    // Cache the equipped skills list (messages[0], name="system") for cross-conversation reuse.
    // The last message's cache is handled by the top-level automatic cache_control on the request.
    if (isFirst && message.name === "system") {
      content[content.length - 1].cache_control = { type: "ephemeral" };
    }
    // On Vertex AI, automatic caching is not supported, so we need an explicit breakpoint on the
    // last message. On the Anthropic API this is handled by the top-level automatic cache_control.
    if (isLast) {
      content[content.length - 1].cache_control = { type: "ephemeral" };
    }
  }

  return {
    role: "user",
    content,
  };
}

function assistantMessage(
  message:
    | AssistantFunctionCallMessageTypeModel
    | AssistantContentMessageTypeModel,
  omittedThinking: boolean
): MessageParam {
  const contents = compact(
    message.contents.map((content) =>
      assistantContentToParam(content, omittedThinking)
    )
  );

  return {
    role: "assistant",
    content: contents,
  };
}

export function detectAnthropicToolSearchEnableSkillConflict(
  messages: ModelMessageTypeMultiActionsWithoutContentFragment[]
): boolean {
  let pendingServerToolUseId: string | null = null;
  let pendingEnableSkillFunctionCallId: string | null = null;
  let enableSkillResultSeen = false;

  for (const message of messages) {
    if (message.role === "assistant") {
      let serverToolUseId: string | null = null;
      let enableSkillFunctionCallId: string | null = null;

      for (const content of message.contents) {
        if (
          content.type === "function_call" &&
          content.value.name === ENABLE_SKILL_FUNCTION_CALL_NAME
        ) {
          enableSkillFunctionCallId = content.value.id;
          continue;
        }

        if (
          content.type !== "provider_passthrough" ||
          content.value.provider !== ANTHROPIC_PROVIDER_ID
        ) {
          continue;
        }

        const block = parseAnthropicToolSearchBlock(content.value.block);
        if (block?.type === "server_tool_use") {
          serverToolUseId = block.id;
        } else if (
          block?.type === "tool_search_tool_result" &&
          block.tool_use_id === pendingServerToolUseId
        ) {
          pendingServerToolUseId = null;
          pendingEnableSkillFunctionCallId = null;
          enableSkillResultSeen = false;
        }
      }

      if (serverToolUseId && enableSkillFunctionCallId) {
        pendingServerToolUseId = serverToolUseId;
        pendingEnableSkillFunctionCallId = enableSkillFunctionCallId;
        enableSkillResultSeen = false;
      }
      continue;
    }

    if (
      message.role === "function" &&
      message.name === ENABLE_SKILL_FUNCTION_CALL_NAME &&
      message.function_call_id === pendingEnableSkillFunctionCallId
    ) {
      enableSkillResultSeen = true;
      continue;
    }

    if (
      pendingServerToolUseId &&
      enableSkillResultSeen &&
      (message.role === "user" || message.role === "compaction")
    ) {
      return true;
    }
  }

  return false;
}

export async function toMessage(
  message: ModelMessageTypeMultiActionsWithoutContentFragment,
  {
    isFirst,
    isLast = false,
    omittedThinking,
    convertToBase64,
  }: {
    isFirst: boolean;
    isLast?: boolean;
    omittedThinking: boolean;
    convertToBase64?: boolean;
  } = {
    isFirst: false,
    omittedThinking: false,
    convertToBase64: false,
  }
): Promise<MessageParam> {
  switch (message.role) {
    case "user":
      return userMessage(message, {
        isFirst,
        isLast,
        convertToBase64: convertToBase64 ?? false,
      });
    case "function":
      return functionMessage(message, {
        isLast,
        convertToBase64: convertToBase64 ?? false,
      });
    case "assistant":
      return assistantMessage(message, omittedThinking);
    case "compaction":
      return {
        role: "user",
        content: message.content,
      };
    default:
      assertNever(message);
  }
}

export function toTool(
  tool: AgentActionSpecification,
  { toolSearchEnabled }: { toolSearchEnabled: boolean }
): Tool {
  return {
    name: tool.name,
    description: tool.description,
    // Eager input streaming allows the LLM to start streaming tool call arguments before
    // the full input is generated, which avoids hanging for long tool call arguments generation,
    // but it can generates invalid input inputs as Anthropic no longer validate them.
    // JSON validity is checked at content_block_stop in anthropic_to_events.ts.
    // See https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming#handling-invalid-json-in-tool-responses
    eager_input_streaming: true,
    input_schema: { ...tool.inputSchema, type: "object" },
    // Defer non-eager tools behind tool search when it is enabled: their schema
    // is kept out of the cached prefix and loaded on demand. Eager tools (and
    // every tool when tool search is off) stay in the prefix. Only set when true
    // so non-deferred tools serialize identically (stable prefix bytes).
    ...(toolSearchEnabled && !tool.eager ? { defer_loading: true } : {}),
  };
}

// Builds the Anthropic `tools` array from the agent's tool specifications. When
// tool search is enabled, non-eager specs are deferred and the tool search tool
// is prepended so the model can discover them on demand. Otherwise the array is
// identical to before. A force-called tool is never deferred, since the model
// cannot be forced to call a tool it would first have to discover via search.
export function toToolsParam(
  specifications: AgentActionSpecification[],
  forceToolCall: string | undefined,
  { toolSearchEnabled }: { toolSearchEnabled: boolean }
) {
  const tools = specifications.map((spec) => {
    const tool = toTool(spec, { toolSearchEnabled });
    if (tool.defer_loading && spec.name === forceToolCall) {
      return { ...tool, defer_loading: false };
    }
    return tool;
  });

  return tools.some((t) => t.defer_loading)
    ? [TOOL_SEARCH_TOOL, ...tools]
    : tools;
}
