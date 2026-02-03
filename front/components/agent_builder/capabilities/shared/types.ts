import type { MCPServerViewTypeWithLabel } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";

export type SelectedTool = {
  view: MCPServerViewTypeWithLabel;
  configuredAction?: BuilderAction;
};

export const TOP_MCP_SERVER_VIEWS: string[] = [
  "web_search_&_browse",
  "image_generation",
  "agent_memory",
  "interactive_content",
  "slack",
  "gmail",
  "google_calendar",
] satisfies InternalMCPServerNameType[];
