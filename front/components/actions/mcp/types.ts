import type { ToolSettings } from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPServerViewType } from "@app/lib/api/mcp";

export type MCPServerToolDefinition =
  MCPServerViewType["server"]["tools"][number];

export interface ToolsAndStakesState {
  serverViewId: string | null;
  search: string;
  selectedToolNames: string[];
}

export interface ToolsAndStakesController {
  search: string;
  setSearch: (search: string) => void;
  tools: MCPServerToolDefinition[];
  visibleTools: MCPServerToolDefinition[];
  selectedToolNames: string[];
  isSelected: (toolName: string) => boolean;
  toggleSelected: (toolName: string) => void;
  areAllVisibleSelected: boolean;
  toggleSelectAllVisible: () => void;
  clearSelection: () => void;
  getSettings: (toolName: string) => ToolSettings;
  updateTool: (toolName: string, patch: Partial<ToolSettings>) => void;
  selectionStakeLevels: MCPToolStakeLevelType[];
  applyToSelection: (patch: Partial<ToolSettings>) => void;
}
