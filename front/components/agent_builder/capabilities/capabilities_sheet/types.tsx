import type { AgentBuilderSkillsType } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { MCPServerViewTypeWithLabel } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import { AGENT_MEMORY_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import type {
  SkillType,
  SkillWithRelationsType,
} from "@app/types/assistant/skill_configuration"; // TODO(skills 2025-12-18): duplicated from MCPServerViewsSheet, to cleanup later

// TODO(skills 2025-12-18): duplicated from MCPServerViewsSheet, to cleanup later
export const TOP_MCP_SERVER_VIEWS = [
  "web_search_&_browse",
  "image_generation",
  AGENT_MEMORY_SERVER_NAME,
  "deep_dive",
  "interactive_content",
  "slack",
  "gmail",
  "google_calendar",
];
export type SelectedTool = {
  view: MCPServerViewTypeWithLabel;
  configuredAction?: BuilderAction;
};

export type CapabilityFilterType = "all" | "tools" | "skills";

type OpenState = { open: boolean };

interface SelectionMode extends OpenState {
  pageId: "selection";
}

interface SkillInfoMode extends OpenState {
  pageId: "skill_info";
  capability: SkillWithRelationsType;
  hasPreviousPage: boolean;
}

interface SkillSpaceSelectionMode extends OpenState {
  pageId: "skill_space_selection";
  capability: SkillType;
}

interface ToolInfoMode extends OpenState {
  pageId: "tool_info";
  capability: BuilderAction;
  hasPreviousPage: boolean;
}

export interface ToolConfigurationMode extends OpenState {
  pageId: "tool_configuration";
  capability: BuilderAction;
  mcpServerView: MCPServerViewTypeWithLabel;
}

export interface ToolEditMode extends OpenState {
  pageId: "tool_edit";
  capability: BuilderAction;
  mcpServerView: MCPServerViewTypeWithLabel;
  index: number;
}

export type CapabilitiesSheetMode =
  | SelectionMode
  | SkillInfoMode
  | SkillSpaceSelectionMode
  | ToolInfoMode
  | ToolConfigurationMode
  | ToolEditMode;

export type CapabilitiesSheetContentProps = {
  mode: CapabilitiesSheetMode;
  onModeChange: (mode: CapabilitiesSheetMode) => void;
  onClose: () => void;
  onCapabilitiesSave: (data: {
    skills: AgentBuilderSkillsType[];
    additionalSpaces: string[];
    tools: SelectedTool[];
  }) => void;
  onToolEditSave: (updatedAction: BuilderAction) => void;
  initialAdditionalSpaces: string[];
  alreadyRequestedSpaceIds: Set<string>;
  alreadyAddedSkillIds: Set<string>;
  selectedActions: BuilderAction[];
  getAgentInstructions: () => string;
};

export function isToolConfigurationOrEditPage(
  mode: CapabilitiesSheetMode
): mode is ToolConfigurationMode | ToolEditMode {
  return mode.pageId === "tool_configuration" || mode.pageId === "tool_edit";
}
