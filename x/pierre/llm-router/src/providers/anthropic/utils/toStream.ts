import type { MessageStream } from "@anthropic-ai/sdk/lib/MessageStream.mjs";
import type { MessageStreamEvent } from "@anthropic-ai/sdk/resources/messages.mjs";
import assertNever from "assert-never";
import { cloneDeep } from "lodash";

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

// Track active content blocks for tool use
type ActiveBlock = {
  index: number;
  type: "text" | "tool_use";
  toolUseId?: string;
  toolName?: string;
  accumulatedJson?: string;
};

export async function* convertAnthropicStreamToRouterEvents(
  stream: MessageStream,
  modelId: AnthropicModelId
): AsyncGenerator<WithMetadataStreamEvent, void, unknown> {
  const outputEvents: WithMetadataOutputEvent[] = [];
  const activeBlocks = new Map<number, ActiveBlock>();

  // Debug instrumentation
  const providerEvents: MessageStreamEvent[] = [];
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
  event: Extract<MessageStreamEvent, { type: "content_block_delta" }>,
  modelId: AnthropicModelId,
  activeBlocks: Map<number, ActiveBlock>
): WithMetadataStreamEvent[] => {
  const delta = event.delta;
  switch (delta.type) {
    case "text_delta":
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
    case "citations_delta":
    case "thinking_delta":
    case "signature_delta":
      // Ignore these delta types for now
      return [];
    default:
      return assertNever(delta);
  }
};

export const toEvents = (
  event: MessageStreamEvent,
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
    case "content_block_start": {
      const block = event.content_block;
      switch (block.type) {
        case "text":
          activeBlocks.set(event.index, {
            index: event.index,
            type: "text",
          });
          return [];
        case "tool_use":
          activeBlocks.set(event.index, {
            index: event.index,
            type: "tool_use",
            toolUseId: block.id,
            toolName: block.name,
            accumulatedJson: "",
          });
          return [];
        default:
          return [];
      }
    }
    case "content_block_delta":
      return handleContentBlockDelta(event, modelId, activeBlocks);
    case "content_block_stop": {
      const block = activeBlocks.get(event.index);
      if (block?.type === "tool_use" && block.toolUseId && block.toolName) {
        // Emit tool_call_request event
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
        activeBlocks.delete(event.index);
        return [toolCallRequestEvent];
      }
      activeBlocks.delete(event.index);
      return [];
    }
    case "message_delta": {
      // Message metadata updated (e.g., stop_reason)
      return [];
    }
    case "message_stop": {
      // Find the responseId from the first event's content
      const responseIdEvent = outputEvents.find(
        (e) => e.type === "interaction_id"
      );
      const responseId = responseIdEvent?.content.id ?? "unknown";

      const completionEvent: WithMetadataCompletionEvent = {
        type: "completion",
        content: { value: [...outputEvents] },
        metadata: {
          modelId,
          providerId: ANTHROPIC_PROVIDER_ID,
          responseId,
        },
      };
      outputEvents.length = 0;
      return [completionEvent];
    }
    default:
      // Handle unknown or unimplemented event types gracefully
      return [];
  }
};
