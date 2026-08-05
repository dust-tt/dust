import type { LLMTraceContext } from "@app/lib/api/llm/traces/types";
import { isFreeOrigin } from "@app/lib/metronome/events";

// Whether an LLM call is free (unbilled). Two cases:
//   - Utility operations (title/skill suggestions, etc.) — anything other than
//     the agent conversation itself. They carry no userMessageOrigin, so they
//     are keyed off operationType.
//   - Agent conversations triggered by a free origin (e.g. sidekick).
export function isFreeUsageContext(context: LLMTraceContext): boolean {
  return (
    context.operationType !== "agent_conversation" ||
    isFreeOrigin(context.userMessageOrigin ?? null)
  );
}
