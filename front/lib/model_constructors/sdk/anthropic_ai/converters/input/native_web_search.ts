import type { WebSearchTool20250305 } from "@anthropic-ai/sdk/resources/messages/messages";
import { NATIVE_WEB_SEARCH_INSTRUCTION } from "@app/lib/model_constructors/types/native_web_search";

// The name Anthropic reports on `server_tool_use` blocks for web search. It is
// the same across every tool version, so output handling stays version
// independent.
export const ANTHROPIC_WEB_SEARCH_TOOL_NAME = "web_search" as const;

// `web_search_20250305` is the version every Claude model we run supports, and
// the only one documented outside the first-party API, which keeps the door open
// for the Vertex host. The later versions (20260209, 20260318) only add
// `response_inclusion`, which matters solely when the search is nested inside a
// code_execution call — something we never do. Bumping is one line here.
//
// Optional fields (`user_location`, `allowed_domains`, `blocked_domains`) are
// deliberately omitted so the serialized tool stays byte-stable for prompt
// caching. `defer_loading` is never set either: this tool replaces one the model
// previously always saw, so it stays in the eager cached prefix rather than
// something the model has to discover through tool search.
export const ANTHROPIC_WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: ANTHROPIC_WEB_SEARCH_TOOL_NAME,
  // Hard per-request ceiling. Each search carries a provider fee that Dust does
  // not meter yet, and Dust's own websearch returned 16 results per call, so
  // eight native searches per turn is generous.
  max_uses: 8,
} as const satisfies WebSearchTool20250305;

export function includesAnthropicWebSearchTool(
  tools: ReadonlyArray<{ type?: string | null }>
): boolean {
  return tools.some((tool) => tool.type === ANTHROPIC_WEB_SEARCH_TOOL.type);
}

export const ANTHROPIC_NATIVE_WEB_SEARCH_INSTRUCTION =
  NATIVE_WEB_SEARCH_INSTRUCTION;
