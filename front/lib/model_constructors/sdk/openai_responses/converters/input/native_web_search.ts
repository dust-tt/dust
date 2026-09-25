import type { WebSearchTool } from "openai/resources/responses/responses";

// `web_search` is the rolling alias; `web_search_2025_08_26` pins a dated
// snapshot. The optional fields (`filters`, `search_context_size`,
// `user_location`) are deliberately omitted so the serialized tool stays
// byte-stable for prompt caching.
export const OPENAI_WEB_SEARCH_TOOL = {
  type: "web_search",
} as const satisfies WebSearchTool;

export function includesOpenAIWebSearchTool(
  tools: ReadonlyArray<{ type?: string | null }>
): boolean {
  return tools.some((tool) => tool.type === OPENAI_WEB_SEARCH_TOOL.type);
}
