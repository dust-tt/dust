import type {
  StreamEvent,
  TextGeneratedEvent,
  WithMetadataStreamEvent,
} from "@/types/output";
import type {
  Response,
  ResponseOutputItem,
  ResponseOutputRefusal,
  ResponseOutputText,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import flatMap from "lodash/flatMap";
import { OPENAI_PROVIDER_ID, type OpenAIModelId } from "@/providers/openai/provider";

const responseOutputToEvent = (
  responseOutput: ResponseOutputText | ResponseOutputRefusal
): StreamEvent => {
  switch (responseOutput.type) {
    case "output_text":
      return {
        type: "text_generated",
        content: {
          value: responseOutput.text,
        },
      };
    case "refusal":
      return {
        type: "error",
        content: {
          message: { value: responseOutput.refusal },
          code: "refusal",
        },
      };

    default:
      return {
        type: "error",
        content: {
          message: {
            value: `Unexpected response output type: ${responseOutput}`,
          },
          code: "unexpected",
        },
      };
  }
};

const itemToEvents = (item: ResponseOutputItem): StreamEvent[] => {
  switch (item.type) {
    case "message":
      return item.content.map((responseOutput) =>
        responseOutputToEvent(responseOutput)
      );
    default:
      return [
        {
          type: "error",
          content: {
            message: {
              value: `Unsupported OpenAI Response type: ${item.type}`,
            },
            code: "unsupported",
          },
        },
      ];
  }
};

const toCompletion = (
  response: Response,
  modelId: OpenAIModelId
): WithMetadataStreamEvent[] => {
  const responseId = {
    type: "interaction_id",
    content: { id: response.id },
  } as const;

  const events: StreamEvent[] = flatMap(
    response.output.map((i) => itemToEvents(i))
  );

  // Find the text_generated event to use in the completion
  const textGeneratedEvent = events.find((e) => e.type === "text_generated") as
    | TextGeneratedEvent
    | undefined;

  if (!textGeneratedEvent) {
    return [
      {
        type: "error",
        content: {
          message: { value: "No text generated in response" },
          code: "unexpected",
        },
        metadata: { modelId, providerId: OPENAI_PROVIDER_ID },
      },
    ];
  }

  if (response.usage === undefined) {
    return [
      {
        type: "completion",
        content: {
          responseId,
          textGenerated: textGeneratedEvent,
        },
        metadata: { modelId, providerId: OPENAI_PROVIDER_ID },
      },
    ];
  }

  const {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    input_tokens_details: inputTokensDetails,
    output_tokens_details: outputTokensDetails,
  } = response.usage;

  const cacheReadTokens = inputTokensDetails?.cached_tokens ?? 0;
  const reasoningTokens = outputTokensDetails?.reasoning_tokens ?? 0;

  return [
    {
      type: "token_usage",
      content: {
        inputTokens: inputTokens - cacheReadTokens,
        cacheReadTokens,
        reasoningTokens,
        outputTokens: outputTokens - reasoningTokens,
        cacheWriteTokens: 0,
      },
      metadata: { modelId, providerId: OPENAI_PROVIDER_ID },
    },
    {
      type: "completion",
      content: {
        responseId,
        textGenerated: textGeneratedEvent,
      },
      metadata: { modelId, providerId: OPENAI_PROVIDER_ID },
    },
  ];
};

export const toEvents = (
  event: ResponseStreamEvent,
  modelId: OpenAIModelId
): WithMetadataStreamEvent[] => {
  switch (event.type) {
    case "response.created":
      return [
        {
          type: "interaction_id",
          content: { id: event.response.id },
          metadata: {
            modelId,
            providerId: OPENAI_PROVIDER_ID,
            createdAt: { value: event.response.created_at },
          },
        },
      ];
    case "response.output_text.delta":
      return [
        {
          type: "text_delta",
          content: { value: event.delta },
          metadata: {
            modelId,
            providerId: OPENAI_PROVIDER_ID,
            itemId: { value: event.item_id },
          },
        },
      ];
    case "response.completed":
      return toCompletion(event.response, modelId);
    case "error":
      return [
        {
          type: "error",
          content: {
            message: { value: event.message },
            originalError: event,
            code: "unknown",
          },
          metadata: { modelId, providerId: OPENAI_PROVIDER_ID },
        },
      ];
    case "response.audio.delta":
    case "response.audio.done":
    case "response.audio.transcript.delta":
    case "response.audio.transcript.done":
    case "response.code_interpreter_call_code.delta":
    case "response.code_interpreter_call_code.done":
    case "response.code_interpreter_call.completed":
    case "response.code_interpreter_call.in_progress":
    case "response.code_interpreter_call.interpreting":
    case "response.content_part.added":
    case "response.content_part.done":
    case "response.custom_tool_call_input.delta":
    case "response.custom_tool_call_input.done":
    case "response.failed":
    case "response.file_search_call.completed":
    case "response.file_search_call.in_progress":
    case "response.file_search_call.searching":
    case "response.function_call_arguments.delta":
    case "response.function_call_arguments.done":
    case "response.image_generation_call.completed":
    case "response.image_generation_call.generating":
    case "response.image_generation_call.in_progress":
    case "response.image_generation_call.partial_image":
    case "response.in_progress":
    case "response.incomplete":
    case "response.mcp_call_arguments.delta":
    case "response.mcp_call_arguments.done":
    case "response.mcp_call.completed":
    case "response.mcp_call.failed":
    case "response.mcp_call.in_progress":
    case "response.mcp_list_tools.completed":
    case "response.mcp_list_tools.failed":
    case "response.mcp_list_tools.in_progress":
    case "response.output_item.added":
    case "response.output_item.done":
    case "response.output_text.annotation.added":
    case "response.output_text.done":
      return [];
    case "response.queued":
    case "response.reasoning_summary_part.added":
    case "response.reasoning_summary_part.done":
    case "response.reasoning_summary_text.delta":
    case "response.reasoning_summary_text.done":
    case "response.reasoning_text.delta":
    case "response.reasoning_text.done":
    case "response.refusal.delta":
    case "response.refusal.done":
      return [
        {
          type: "error",
          content: {
            message: { value: "Provider refusal" },
            originalError: event,
            code: "refusal",
          },
          metadata: { modelId, providerId: OPENAI_PROVIDER_ID },
        },
      ];
    case "response.web_search_call.completed":
    case "response.web_search_call.in_progress":
    case "response.web_search_call.searching":
      return [];
    default:
      return [
        {
          type: "error",
          content: {
            message: { value: "Unsupported OpenAI Response Event" },
            originalError: event,
            code: "unknown",
          },
          metadata: { modelId, providerId: OPENAI_PROVIDER_ID },
        },
      ];
  }
};
