import type React from "react";

import type { AgentBuilderSkillsType } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { MCPServerViewTypeWithLabel } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import { AGENT_MEMORY_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import type { UserType, WorkspaceType } from "@app/types";
import type { SkillType } from "@app/types/assistant/skill_configuration";

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

export const SKILLS_SHEET_PAGE_IDS = {
  SELECTION: "selection",
  SKILL_INFO: "skill_info",
  SKILL_SPACE_SELECTION: "skill_space_selection",
  TOOL_INFO: "tool_info",
  TOOL_CONFIGURATION: "tool_configuration",
  TOOL_EDIT: "tool_edit",
} as const;

export type SkillsSheetMode =
  | { pageId: typeof SKILLS_SHEET_PAGE_IDS.SELECTION }
  | {
      pageId: typeof SKILLS_SHEET_PAGE_IDS.SKILL_INFO;
      skill: SkillType;
      hasPreviousPage: boolean;
    }
  | {
      pageId: typeof SKILLS_SHEET_PAGE_IDS.SKILL_SPACE_SELECTION;
      skillConfiguration: SkillType;
    }
  | {
      pageId: typeof SKILLS_SHEET_PAGE_IDS.TOOL_INFO;
      action: BuilderAction;
      hasPreviousPage: boolean;
    }
  | {
      pageId: typeof SKILLS_SHEET_PAGE_IDS.TOOL_CONFIGURATION;
      action: BuilderAction;
      mcpServerView: MCPServerViewTypeWithLabel;
    }
  | {
      pageId: typeof SKILLS_SHEET_PAGE_IDS.TOOL_EDIT;
      action: BuilderAction;
      index: number;
    };

export type SelectionMode = Extract<
  SkillsSheetMode,
  { type: typeof SKILLS_SHEET_PAGE_IDS.SELECTION }
>;

export type SpaceSelectionMode = Extract<
  SkillsSheetMode,
  { type: typeof SKILLS_SHEET_PAGE_IDS.SKILL_SPACE_SELECTION }
>;

export type PageContentProps = {
  mode: SkillsSheetMode;
  onModeChange: (mode: SkillsSheetMode | null) => void;
  onClose: () => void;
  handleSave: () => void;
  owner: WorkspaceType;
  user: UserType;
  alreadyRequestedSpaceIds: Set<string>;
  localSelectedSkills: AgentBuilderSkillsType[];
  setLocalSelectedSkills: React.Dispatch<
    React.SetStateAction<AgentBuilderSkillsType[]>
  >;
  localAdditionalSpaces: string[];
  setLocalAdditionalSpaces: React.Dispatch<React.SetStateAction<string[]>>;
};
