import type {
  ImageBlockParam,
  MessageParam,
  TextBlockParam,
  ThinkingBlockParam,
  Tool,
  ToolResultBlockParam,
  ToolUseBlockParam,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { extractEncryptedContentFromMetadata } from "@app/lib/api/llm/utils";
import { parseToolArguments } from "@app/lib/api/llm/utils/tool_arguments";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type {
  AgentFunctionCallContentType,
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

      const { mediaType, data } = await trustedFetchImageBase64(
        content.image_url.url
      );

      assert(
        isAcceptedMediaType(mediaType),
        `Unsupported media type: ${mediaType}`
      );

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
    | AgentFunctionCallContentType,
  omittedThinking: boolean
):
  | TextBlockParam
  | ImageBlockParam
  | ThinkingBlockParam
  | ToolUseBlockParam
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
  }
}

async function toolResultToParam(
  message: FunctionMessageTypeModel
): Promise<ToolResultBlockParam> {
  return {
    type: "tool_result",
    tool_use_id: message.function_call_id,
    content: isString(message.content)
      ? message.content
      : await concurrentExecutor(
          message.content,
          (c) => userContentToParam(c),
          { concurrency: 10 }
        ),
  };
}

async function functionMessage(
  message: FunctionMessageTypeModel
): Promise<MessageParam> {
  return {
    role: "user",
    content: [await toolResultToParam(message)],
  };
}

async function userMessage(
  message: UserMessageTypeModel,
  { isLast, convertToBase64 }: { isLast: boolean; convertToBase64: boolean }
): Promise<MessageParam> {
  const content = await concurrentExecutor(
    message.content,
    (c) => userContentToParam(c, { convertToBase64 }),
    { concurrency: 10 }
  );

  // Add cache_control to the last content block if this is the last message.
  if (isLast && content.length > 0) {
    content[content.length - 1].cache_control = { type: "ephemeral" };
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

export async function toMessage(
  message: ModelMessageTypeMultiActionsWithoutContentFragment,
  {
    isLast,
    omittedThinking,
    convertToBase64,
  }: {
    isLast: boolean;
    omittedThinking: boolean;
    convertToBase64?: boolean;
  } = {
    isLast: false,
    omittedThinking: false,
    convertToBase64: false,
  }
): Promise<MessageParam> {
  switch (message.role) {
    case "user":
      return userMessage(message, {
        isLast,
        convertToBase64: convertToBase64 ?? false,
      });
    case "function":
      return functionMessage(message);
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

export function toTool(tool: AgentActionSpecification): Tool {
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
  };
}
