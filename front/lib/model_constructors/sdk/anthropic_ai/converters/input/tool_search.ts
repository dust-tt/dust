// Shared by the legacy LLM client (lib/api/llm/clients/anthropic) and the
// model_constructors client. Both prepend the tool search tool when at least one
// tool is deferred, and both surface the same system-prompt hint so the model
// searches for deferred tools instead of guessing.

// The tool search tool both clients prepend to the tools array whenever at least
// one tool is deferred, so the model can discover those tools on demand.
export const TOOL_SEARCH_TOOL = {
  type: "tool_search_tool_bm25_20251119",
  name: "tool_search_tool_bm25",
} as const;

// The predicate below reads the converted tools array instead of re-deriving from
// the specs, so it stays in lockstep with the prepend decision, including the
// force-call edge case where the only deferred tool is un-deferred and no search
// tool is prepended.
const TOOL_SEARCH_TOOL_TYPE = TOOL_SEARCH_TOOL.type;

// Added to the system prompt only when the search tool is in the request. Phrased
// without naming the bm25 tool so it stays accurate across search implementations.
export const TOOL_SEARCH_INSTRUCTION =
  "You can search for and load far more tools than are visible to you now, " +
  "including ones that fetch live or account-specific data and act in external " +
  "systems. When a request needs current state, the user's own systems, or an " +
  "action your visible tools cannot take, search for a tool before making " +
  "something up, answering from stale memory, or telling the user it is not " +
  "possible.";

export function includesToolSearchTool(
  tools: ReadonlyArray<{ type?: string | null }>
): boolean {
  return tools.some((tool) => tool.type === TOOL_SEARCH_TOOL_TYPE);
}
