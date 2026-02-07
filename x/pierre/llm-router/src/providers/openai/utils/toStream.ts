import assertNever from "assert-never";
import type { ResponseStreamEvent } from "openai/resources/responses/responses";
import type { Stream } from "openai/streaming";

import {
  OPENAI_PROVIDER_ID,
  type OpenAIModelId,
} from "@/providers/openai/types";
import type {
  WithMetadataCompletionEvent,
  WithMetadataOutputEvent,
  WithMetadataReasoningGeneratedEvent,
  WithMetadataResponseIdEvent,
  WithMetadataStreamEvent,
  WithMetadataTextGeneratedEvent,
} from "@/types/output";

export async function* convertOpenAIStreamToRouterEvents(
  stream: Stream<ResponseStreamEvent>,
  modelId: OpenAIModelId
): AsyncGenerator<WithMetadataStreamEvent, void, unknown> {
  const outputEvents: WithMetadataOutputEvent[] = [];

  for await (const event of stream) {
    const events = toEvents(event, modelId, outputEvents);

    yield* events;
  }
}

export const toEvents = (
  event: ResponseStreamEvent,
  modelId: OpenAIModelId,
  outputEvents: WithMetadataOutputEvent[]
): WithMetadataStreamEvent[] => {
  switch (event.type) {
    case "response.created": {
      const responseIdEvent: WithMetadataResponseIdEvent = {
        type: "interaction_id",
        content: { id: event.response.id },
        metadata: {
          modelId,
          providerId: OPENAI_PROVIDER_ID,
          createdAt: event.response.created_at,
          responseId: event.response.id,
        },
      };
      outputEvents.push(responseIdEvent);
      return [responseIdEvent];
    }
    case "response.output_text.delta":
      return [
        {
          type: "text_delta",
          content: { value: event.delta },
          metadata: {
            modelId,
            providerId: OPENAI_PROVIDER_ID,
            itemId: event.item_id,
          },
        },
      ];
    case "response.output_text.done": {
      const textGeneratedEvent: WithMetadataTextGeneratedEvent = {
        type: "text_generated",
        content: { value: event.text },
        metadata: {
          modelId,
          providerId: OPENAI_PROVIDER_ID,
          itemId: event.item_id,
        },
      };
      outputEvents.push(textGeneratedEvent);

      console.log(
        "Text generated event:",
        JSON.stringify(outputEvents, null, 2)
      );
      return [textGeneratedEvent];
    }
    case "response.reasoning_summary_text.delta":
      return [
        {
          type: "reasoning_delta",
          content: { value: event.delta },
          metadata: {
            modelId,
            providerId: OPENAI_PROVIDER_ID,
            itemId: { value: event.item_id },
          },
        },
      ];
    case "response.reasoning_summary_text.done": {
      const reasoningGeneratedEvent: WithMetadataReasoningGeneratedEvent = {
        type: "reasoning_generated",
        content: { value: event.text },
        metadata: {
          modelId,
          providerId: OPENAI_PROVIDER_ID,
          itemId: event.item_id,
        },
      };
      outputEvents.push(reasoningGeneratedEvent);
      return [reasoningGeneratedEvent];
    }
    case "response.completed": {
      const completionEvent: WithMetadataCompletionEvent = {
        type: "completion",
        content: { value: [...outputEvents] },
        metadata: {
          modelId,
          providerId: OPENAI_PROVIDER_ID,
          responseId: event.response.id,
          createdAt: event.response.created_at,
          completedAt: event.response.completed_at ?? undefined,
        },
      };
      outputEvents.length = 0;
      return [completionEvent];
    }
    case "error":
      return [
        {
          type: "error",
          content: {
            message: event.message,
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
    case "response.reasoning_summary_part.done":
    case "response.reasoning_text.delta":
    case "response.reasoning_text.done":
    case "response.queued":
    case "response.reasoning_summary_part.added":
      return [];
    case "response.incomplete":
      return [
        {
          type: "error",
          content: {
            message: "Incomplete answer likely due to token limit reached",
            originalError: event,
            code: "incomplete",
          },
          metadata: { modelId, providerId: OPENAI_PROVIDER_ID },
        },
      ];
    case "response.refusal.delta":
    case "response.refusal.done":
      return [
        {
          type: "error",
          content: {
            message: "Provider refusal",
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
      assertNever(event);
  }
};
