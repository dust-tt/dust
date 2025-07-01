import type { MCPServerViewType } from "@app/lib/api/mcp";

/**
 * Helper function to identify search servers
 */
export function isSearchServer(view: MCPServerViewType): boolean {
  return view.server.name === "search";
}
