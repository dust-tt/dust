export const OPENAI_TOOL_SEARCH_TOOL = { type: "tool_search" } as const;

export function includesOpenAIToolSearchTool(
  tools: ReadonlyArray<{ type?: string | null }>
): boolean {
  return tools.some((tool) => tool.type === OPENAI_TOOL_SEARCH_TOOL.type);
}
