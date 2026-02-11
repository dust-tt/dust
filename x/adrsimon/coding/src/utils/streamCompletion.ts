import type { DustAPI } from "@dust-tt/client";

import type { DustMessage, ToolDefinition } from "../agent/types.js";

/**
 * CLI completion event types (matching what the proxy endpoint emits).
 */
export interface CLITextDeltaEvent {
  type: "text_delta";
  text: string;
}

export interface CLIThinkingDeltaEvent {
  type: "thinking_delta";
  text: string;
}

export interface CLIToolUseEvent {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface CLIUsageEvent {
  type: "usage";
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens?: number;
  cached_tokens?: number;
}

export interface CLIDoneEvent {
  type: "done";
  stop_reason: "end_turn" | "tool_use";
}

export interface CLIErrorEvent {
  type: "error";
  message: string;
  error_type?: string;
  retryable?: boolean;
}

export type CLICompletionEvent =
  | CLITextDeltaEvent
  | CLIThinkingDeltaEvent
  | CLIToolUseEvent
  | CLIUsageEvent
  | CLIDoneEvent
  | CLIErrorEvent;

interface StreamCompletionParams {
  messages: DustMessage[];
  tools?: ToolDefinition[];
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Stream a CLI completion through the Dust proxy endpoint.
 * Uses the DustAPI's request method directly.
 */
export async function streamCLICompletion(
  dustClient: DustAPI,
  params: StreamCompletionParams
): Promise<AsyncGenerator<CLICompletionEvent, void, unknown>> {
  // Use the DustAPI's request method to POST to the completion endpoint.
  const res = await (dustClient as any).request({
    method: "POST",
    path: "cli/completion",
    body: {
      conversation: { messages: params.messages },
      tools: params.tools,
      system: params.system,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
    },
    stream: true,
  });

  if (res.isErr()) {
    return (async function* () {
      yield {
        type: "error" as const,
        message: res.error.message,
      };
    })();
  }

  const { response } = res.value;

  if (!response.ok || !response.body) {
    const text =
      typeof response.body === "string" ? response.body : "Stream not available";
    return (async function* () {
      yield {
        type: "error" as const,
        message: `Error streaming completion: status=${response.status} ${text}`,
      };
    })();
  }

  return parseSSEStream(response.body as ReadableStream<Uint8Array>);
}

async function* parseSSEStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<CLICompletionEvent, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { value, done } = await reader.read();

      if (value) {
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer.
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "done") {
              return;
            }
            try {
              const event = JSON.parse(data) as CLICompletionEvent;
              yield event;
            } catch {
              // Skip malformed events.
            }
          }
        }
      }

      if (done) {
        break;
      }
    }

    // Process any remaining data in buffer.
    if (buffer.startsWith("data: ")) {
      const data = buffer.slice(6).trim();
      if (data && data !== "done") {
        try {
          const event = JSON.parse(data) as CLICompletionEvent;
          yield event;
        } catch {
          // Skip.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
