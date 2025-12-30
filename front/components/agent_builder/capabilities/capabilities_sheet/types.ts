import type { AgentBuilderSkillsType } from "@app/components/agent_builder/AgentBuilderFormContext";
import type {
  CapabilitiesSheetState,
  SheetState,
} from "@app/components/agent_builder/skills/types";
import type { MCPServerViewTypeWithLabel } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import { AGENT_MEMORY_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";

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

export type CapabilitiesSheetContentProps = {
  isOpen: boolean;
  sheetState: CapabilitiesSheetState;
  onStateChange: (state: SheetState) => void;
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
