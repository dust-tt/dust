import { TOOL_SEARCH_INSTRUCTION } from "@app/lib/api/llm/utils/tool_search";

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

// Added to the system prompt only when the search tool is in the request. The
// Anthropic-specific paragraph steers the model away from mixing a tool search
// with a regular tool call in the same turn. The API leaves such searches un-run
// when the turn ends on the tool call, and replaying the un-run blocks is fragile.
// Skill-enabling tools are called out explicitly because they are the most
// frequent offender observed in practice. It also discourages chaining searches
// when a tool returned by the first search can already handle the task.
export const ANTHROPIC_TOOL_SEARCH_INSTRUCTION =
  TOOL_SEARCH_INSTRUCTION +
  "\n\n" +
  "Never mix tool searches with other tool calls in the same turn. Issuing " +
  "several searches together is fine, but if you call any other tool " +
  "(including enabling a skill) in the same turn as a search, the search is " +
  "discarded and never runs. Search first, wait for the results, and only " +
  "then call the other tools you need. Avoid chaining searches one after " +
  "another: prefer using the best matching tool from the results. Search " +
  "again only if none of the returned tools can handle the task, and refine " +
  "the query instead of repeating it.";

export function includesToolSearchTool(
  tools: ReadonlyArray<{ type?: string | null }>
): boolean {
  return tools.some((tool) => tool.type === TOOL_SEARCH_TOOL_TYPE);
}
