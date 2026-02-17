import type { BetaMessageStream } from "@anthropic-ai/sdk/lib/BetaMessageStream.mjs";
import type { BetaRawMessageStreamEvent } from "@anthropic-ai/sdk/resources/beta.mjs";
import type { MessageStreamEvent } from "@anthropic-ai/sdk/resources/messages.mjs";
import assertNever from "assert-never";
import cloneDeep from "lodash/cloneDeep";

import {
  ANTHROPIC_PROVIDER_ID,
  type AnthropicModelId,
} from "@/providers/anthropic/types";
import type {
  WithMetadataCompletionEvent,
  WithMetadataOutputEvent,
  WithMetadataResponseIdEvent,
  WithMetadataStreamEvent,
} from "@/types/output";
import * as fs from "node:fs";
import * as path from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Track active content blocks for tool use, text, and thinking
type ActiveBlock =
  | {
      index: number;
      type: "text";
      accumulatedText?: string;
    }
  | {
      index: number;
      type: "tool_use";
      toolUseId?: string;
      toolName?: string;
      accumulatedJson?: string;
    }
  | {
      index: number;
      type: "thinking";
      accumulatedThinking?: string;
    };

export async function* convertAnthropicStreamToRouterEvents(
  stream: BetaMessageStream,
  modelId: AnthropicModelId
): AsyncGenerator<WithMetadataStreamEvent, void, unknown> {
  const outputEvents: WithMetadataOutputEvent[] = [];
  const activeBlocks = new Map<number, ActiveBlock>();

  // Debug instrumentation
  const providerEvents: BetaRawMessageStreamEvent[] = [];
  const routerEvents: WithMetadataStreamEvent[] = [];

  const timestamp = Date.now().toString();
  const providerPath = path.join(
    __dirname,
    `events_provider_${timestamp}.json`
  );
  const routerPath = path.join(__dirname, `events_router_${timestamp}.json`);

  try {
    for await (const mutableEvent of stream) {
      const event = cloneDeep(mutableEvent);
      providerEvents.push(event);
      const events = toEvents(event, modelId, outputEvents, activeBlocks);
      routerEvents.push(...events);
      yield* events;
    }
  } finally {
    // Always write files, even if stream errors or is interrupted
    await fs.promises.writeFile(
      providerPath,
      JSON.stringify(providerEvents, null, 2),
      "utf8"
    );
    await fs.promises.writeFile(
      routerPath,
      JSON.stringify(routerEvents, null, 2),
      "utf8"
    );
    console.log("\n[Debug] Events captured:");
    console.log(`  Provider: ${providerPath}`);
    console.log(`  Router: ${routerPath}`);
  }
}

const handleContentBlockDelta = (
  event: Extract<BetaRawMessageStreamEvent, { type: "content_block_delta" }>,
  modelId: AnthropicModelId,
  activeBlocks: Map<number, ActiveBlock>
): WithMetadataStreamEvent[] => {
  const delta = event.delta;
  switch (delta.type) {
    case "text_delta": {
      // Ensure the block exists and accumulate text
      if (!activeBlocks.has(event.index)) {
        activeBlocks.set(event.index, {
          index: event.index,
          type: "text",
          accumulatedText: "",
        });
      }
      const block = activeBlocks.get(event.index);
      if (block?.type === "text") {
        block.accumulatedText = (block.accumulatedText ?? "") + delta.text;
      }
      return [
        {
          type: "text_delta",
          content: { value: delta.text },
          metadata: {
            modelId,
            providerId: ANTHROPIC_PROVIDER_ID,
          },
        },
      ];
    }
    case "input_json_delta": {
      // Accumulate JSON for tool use
      const block = activeBlocks.get(event.index);
      if (block?.type === "tool_use") {
        block.accumulatedJson =
          (block.accumulatedJson ?? "") + delta.partial_json;
      }
      return [
        {
          type: "tool_call_arguments_delta",
          content: { value: delta.partial_json },
          metadata: {
            modelId,
            providerId: ANTHROPIC_PROVIDER_ID,
          },
        },
      ];
    }
    case "thinking_delta": {
      // Ensure the block exists and accumulate thinking
      if (!activeBlocks.has(event.index)) {
        activeBlocks.set(event.index, {
          index: event.index,
          type: "thinking",
          accumulatedThinking: "",
        });
      }
      const block = activeBlocks.get(event.index);
      if (block?.type === "thinking") {
        block.accumulatedThinking =
          (block.accumulatedThinking ?? "") + delta.thinking;
      }

      return [
        {
          type: "reasoning_delta",
          content: { value: delta.thinking },
          metadata: {
            modelId,
            providerId: ANTHROPIC_PROVIDER_ID,
          },
        },
      ];
    }
    case "citations_delta":
    case "signature_delta":
    case "compaction_delta":
      // Ignore these delta types for now
      return [];
    default:
      return assertNever(delta);
  }
};

const handleTextBlockStart = (
  eventIndex: number,
  activeBlocks: Map<number, ActiveBlock>
): WithMetadataStreamEvent[] => {
  activeBlocks.set(eventIndex, {
    index: eventIndex,
    type: "text",
    accumulatedText: "",
  });
  return [];
};

const handleToolUseBlockStart = (
  eventIndex: number,
  block: { id: string; name: string },
  activeBlocks: Map<number, ActiveBlock>
): WithMetadataStreamEvent[] => {
  activeBlocks.set(eventIndex, {
    index: eventIndex,
    type: "tool_use",
    toolUseId: block.id,
    toolName: block.name,
    accumulatedJson: "",
  });
  return [];
};

const handleThinkingBlockStart = (
  eventIndex: number,
  activeBlocks: Map<number, ActiveBlock>
): WithMetadataStreamEvent[] => {
  activeBlocks.set(eventIndex, {
    index: eventIndex,
    type: "thinking",
    accumulatedThinking: "",
  });
  return [];
};

const handleContentBlockStart = (
  event: Extract<BetaRawMessageStreamEvent, { type: "content_block_start" }>,
  activeBlocks: Map<number, ActiveBlock>
): WithMetadataStreamEvent[] => {
  const block = event.content_block;

  switch (block.type) {
    case "text":
      return handleTextBlockStart(event.index, activeBlocks);
    case "tool_use":
      return handleToolUseBlockStart(event.index, block, activeBlocks);
    case "thinking":
      return handleThinkingBlockStart(event.index, activeBlocks);
    case "redacted_thinking":
    case "server_tool_use":
    case "web_search_tool_result":
    case "web_fetch_tool_result":
    case "code_execution_tool_result":
    case "bash_code_execution_tool_result":
    case "text_editor_code_execution_tool_result":
    case "tool_search_tool_result":
    case "mcp_tool_use":
    case "mcp_tool_result":
    case "container_upload":
    case "compaction":
      return [];
    default:
      return assertNever(block);
  }
};

const handleToolUseBlockStop = (
  block: Extract<ActiveBlock, { type: "tool_use" }>,
  modelId: AnthropicModelId,
  outputEvents: WithMetadataOutputEvent[]
): WithMetadataStreamEvent[] => {
  if (!(block.toolUseId && block.toolName)) {
    return [];
  }
  const toolCallRequestEvent = {
    type: "tool_call_request" as const,
    content: {
      toolName: block.toolName,
      arguments: block.accumulatedJson ?? "{}",
    },
    metadata: {
      modelId,
      providerId: ANTHROPIC_PROVIDER_ID,
      callId: block.toolUseId,
    },
  };
  outputEvents.push(toolCallRequestEvent);
  return [toolCallRequestEvent];
};

const handleTextBlockStop = (
  block: Extract<ActiveBlock, { type: "text" }>,
  modelId: AnthropicModelId,
  outputEvents: WithMetadataOutputEvent[]
): WithMetadataStreamEvent[] => {
  const textGeneratedEvent = {
    type: "text_generated" as const,
    content: {
      value: block.accumulatedText ?? "",
    },
    metadata: {
      modelId,
      providerId: ANTHROPIC_PROVIDER_ID,
    },
  };
  outputEvents.push(textGeneratedEvent);
  return [textGeneratedEvent];
};

const handleReasoningBlockStop = (
  block: Extract<ActiveBlock, { type: "thinking" }>,
  modelId: AnthropicModelId,
  outputEvents: WithMetadataOutputEvent[]
): WithMetadataStreamEvent[] => {
  const reasoningGeneratedEvent = {
    type: "reasoning_generated" as const,
    content: {
      value: block.accumulatedThinking ?? "",
    },
    metadata: {
      modelId,
      providerId: ANTHROPIC_PROVIDER_ID,
    },
  };
  outputEvents.push(reasoningGeneratedEvent);
  return [reasoningGeneratedEvent];
};

const handleContentBlockStop = (
  event: Extract<MessageStreamEvent, { type: "content_block_stop" }>,
  modelId: AnthropicModelId,
  outputEvents: WithMetadataOutputEvent[],
  activeBlocks: Map<number, ActiveBlock>
): WithMetadataStreamEvent[] => {
  const block = activeBlocks.get(event.index);
  activeBlocks.delete(event.index);

  if (!block) {
    return [];
  }

  if (block.type === "tool_use") {
    return handleToolUseBlockStop(block, modelId, outputEvents);
  }
  if (block.type === "text") {
    return handleTextBlockStop(block, modelId, outputEvents);
  }
  if (block.type === "thinking") {
    return handleReasoningBlockStop(block, modelId, outputEvents);
  }
  return assertNever(block);
};

export const toEvents = (
  event: BetaRawMessageStreamEvent,
  modelId: AnthropicModelId,
  outputEvents: WithMetadataOutputEvent[],
  activeBlocks: Map<number, ActiveBlock>
): WithMetadataStreamEvent[] => {
  switch (event.type) {
    case "message_start": {
      const responseIdEvent: WithMetadataResponseIdEvent = {
        type: "interaction_id",
        content: { id: event.message.id },
        metadata: {
          modelId,
          providerId: ANTHROPIC_PROVIDER_ID,
        },
      };
      outputEvents.push(responseIdEvent);
      return [responseIdEvent];
    }
    case "content_block_start":
      return handleContentBlockStart(event, activeBlocks);
    case "content_block_delta":
      return handleContentBlockDelta(event, modelId, activeBlocks);
    case "content_block_stop":
      return handleContentBlockStop(event, modelId, outputEvents, activeBlocks);
    case "message_delta": {
      // Handle usage
      return [];
    }
    case "message_stop": {
      const completionEvent: WithMetadataCompletionEvent = {
        type: "completion",
        content: { value: [...outputEvents] },
        metadata: {
          modelId,
          providerId: ANTHROPIC_PROVIDER_ID,
        },
      };
      outputEvents.length = 0;
      return [completionEvent];
    }
    default:
      // Handle unknown or unimplemented event types gracefully
      assertNever(event);
  }
};
