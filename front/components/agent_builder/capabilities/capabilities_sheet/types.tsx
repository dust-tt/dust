import type { AgentBuilderSkillsType } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { MCPServerViewTypeWithLabel } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import { AGENT_MEMORY_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import type { UserType, WorkspaceType } from "@app/types";
import type {
  SkillType,
  SkillWithRelationsType,
} from "@app/types/assistant/skill_configuration";

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
  type: "MCP";
  view: MCPServerViewTypeWithLabel;
  configuredAction?: BuilderAction;
};

export type CapabilityFilterType = "all" | "tools" | "skills";

type SelectionMode = {
  pageId: "selection";
};

type SkillInfoMode = {
  pageId: "skill_info";
  capability: SkillWithRelationsType;
  hasPreviousPage: boolean;
};

type SkillSpaceSelectionMode = {
  pageId: "skill_space_selection";
  capability: SkillType;
};

type ToolInfoMode = {
  pageId: "tool_info";
  capability: BuilderAction;
  hasPreviousPage: boolean;
};

type ToolConfigurationMode = {
  pageId: "tool_configuration";
  capability: BuilderAction;
  mcpServerView: MCPServerViewTypeWithLabel;
};

type ToolEditMode = {
  pageId: "tool_edit";
  capability: BuilderAction;
  index: number;
};

export type CapabilitiesSheetMode =
  | SelectionMode
  | SkillInfoMode
  | SkillSpaceSelectionMode
  | ToolInfoMode
  | ToolConfigurationMode
  | ToolEditMode;

export type CapabilitiesSheetContentProps = {
  mode: CapabilitiesSheetMode;
  onModeChange: (mode: CapabilitiesSheetMode | null) => void;
  onClose: () => void;
  onSave: (data: {
    skills: AgentBuilderSkillsType[];
    additionalSpaces: string[];
    tools: SelectedTool[];
  }) => void;
  owner: WorkspaceType;
  user: UserType;
  initialAdditionalSpaces: string[];
  alreadyRequestedSpaceIds: Set<string>;
  alreadyAddedSkillIds: Set<string>;
  selectedActions: BuilderAction[];
};
