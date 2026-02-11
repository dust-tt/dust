import type { DustAPI } from "@dust-tt/client";

import { streamCLICompletion } from "../utils/streamCompletion.js";
import type { CLIToolUseEvent } from "../utils/streamCompletion.js";

import type {
  AgentContentItem,
  AgentEvent,
  DustMessage,
  ToolCall,
  ToolDefinition,
} from "./types.js";

interface AgentLoopParams {
  dustClient: DustAPI;
  systemPrompt: string;
  tools: ToolDefinition[];
  executeTool: (call: ToolCall) => Promise<string>;
  maxTokens?: number;
}

/**
 * The local agent loop. Yields AgentEvents that the UI consumes for rendering.
 *
 * Usage:
 *   const loop = createAgentLoop(params);
 *   loop.sendMessage("Hello");
 *   for await (const event of loop.events()) { ... }
 */
export function createAgentLoop(params: AgentLoopParams) {
  const { dustClient, systemPrompt, tools, executeTool, maxTokens = 16384 } = params;
  const messages: DustMessage[] = [];

  // Event queue for the UI to consume.
  let eventResolve: ((event: AgentEvent) => void) | null = null;
  const eventQueue: AgentEvent[] = [];
  let done = false;

  function emit(event: AgentEvent) {
    if (eventResolve) {
      const resolve = eventResolve;
      eventResolve = null;
      resolve(event);
    } else {
      eventQueue.push(event);
    }
  }

  async function* events(): AsyncGenerator<AgentEvent> {
    while (!done) {
      if (eventQueue.length > 0) {
        yield eventQueue.shift()!;
      } else {
        yield await new Promise<AgentEvent>((resolve) => {
          eventResolve = resolve;
        });
      }
    }
    // Flush remaining events.
    while (eventQueue.length > 0) {
      yield eventQueue.shift()!;
    }
  }

  async function runCompletionLoop() {
    // Keep looping as long as the model wants to use tools.
    while (true) {
      let eventStream: AsyncGenerator<import("../utils/streamCompletion.js").CLICompletionEvent, void, unknown>;

      try {
        eventStream = await streamCLICompletion(dustClient, {
          messages,
          tools,
          system: systemPrompt,
          maxTokens,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emit({ type: "error", message });
        return;
      }

      // Accumulate tool calls from this turn.
      const toolCalls: ToolCall[] = [];
      let currentText = "";
      let stopReason = "end_turn";

      for await (const event of eventStream) {
        switch (event.type) {
          case "text_delta":
            currentText += event.text;
            emit({ type: "text_delta", text: event.text });
            break;

          case "thinking_delta":
            emit({ type: "thinking_delta", text: event.text });
            break;

          case "tool_use": {
            const toolEvent = event as CLIToolUseEvent;
            toolCalls.push({
              id: toolEvent.id,
              name: toolEvent.name,
              input: toolEvent.input,
            });
            emit({
              type: "tool_use",
              id: toolEvent.id,
              name: toolEvent.name,
              input: toolEvent.input,
            });
            break;
          }

          case "usage":
            emit({
              type: "usage",
              inputTokens: event.input_tokens,
              outputTokens: event.output_tokens,
            });
            break;

          case "done":
            stopReason = event.stop_reason;
            break;

          case "error":
            emit({
              type: "error",
              message: event.message,
              retryable: event.retryable,
            });
            return;
        }
      }

      // Build assistant message in Dust internal format.
      if (toolCalls.length > 0) {
        const functionCalls = toolCalls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          arguments: JSON.stringify(tc.input),
        }));
        const contents: AgentContentItem[] = [];
        if (currentText) {
          contents.push({ type: "text_content", value: currentText });
        }
        for (const fc of functionCalls) {
          contents.push({ type: "function_call", value: fc });
        }
        messages.push({ role: "assistant", function_calls: functionCalls, contents });
      } else if (currentText) {
        messages.push({
          role: "assistant",
          name: "assistant",
          contents: [{ type: "text_content", value: currentText }],
        });
      }

      // If no tool calls, we're done with this turn.
      if (toolCalls.length === 0) {
        emit({ type: "done", stopReason });
        return;
      }

      // Execute tools and push one FunctionMessage per result.
      for (const toolCall of toolCalls) {
        emit({
          type: "tool_executing",
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.input,
        });

        const result = await executeTool(toolCall);

        messages.push({
          role: "function",
          name: toolCall.name,
          function_call_id: toolCall.id,
          content: result,
        });

        emit({
          type: "tool_result",
          id: toolCall.id,
          name: toolCall.name,
          result,
        });
      }

      // Loop back for the next LLM call.
    }
  }

  return {
    events,

    sendMessage(content: string) {
      messages.push({ role: "user", name: "user", content: [{ type: "text", text: content }] });
      runCompletionLoop();
    },

    stop() {
      done = true;
      emit({ type: "done", stopReason: "stopped" });
    },

    getMessages() {
      return messages;
    },
  };
}

export type AgentLoop = ReturnType<typeof createAgentLoop>;
