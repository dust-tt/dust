import type { ExploratoryToolCallInfo } from "@app/lib/reinforced_agent/types";
import type { ModelMessageTypeMultiActionsWithoutContentFragment } from "@app/types/assistant/generation";

/**
 * Build continuation messages from exploratory tool calls and their results.
 * Returns an assistant function-call message followed by function-result messages.
 *
 * Defined in a standalone module (rather than in run_reinforced_analysis.ts) so
 * that Temporal workflow files can import it without pulling in heavy deps (zod, etc.).
 */
export function buildContinuationMessages(
  exploratoryToolCalls: ExploratoryToolCallInfo[],
  toolResults: Record<string, string>
): ModelMessageTypeMultiActionsWithoutContentFragment[] {
  const messages: ModelMessageTypeMultiActionsWithoutContentFragment[] = [];

  // Assistant message with function calls in `contents` (the format used by
  // the Anthropic conversion layer).
  messages.push({
    role: "assistant" as const,
    function_calls: [],
    contents: exploratoryToolCalls.map((tc) => ({
      type: "function_call" as const,
      value: {
        id: tc.id,
        name: tc.name,
        arguments: JSON.stringify(tc.arguments),
      },
    })),
  });

  // Function result messages — one per tool call.
  for (const tc of exploratoryToolCalls) {
    messages.push({
      role: "function" as const,
      name: tc.name,
      function_call_id: tc.id,
      content: toolResults[tc.id] ?? "",
    });
  }

  return messages;
}
