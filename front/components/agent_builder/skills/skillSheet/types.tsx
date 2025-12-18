import type React from "react";

import type { AgentBuilderSkillsType } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { MCPServerViewTypeWithLabel } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import type { UserType, WorkspaceType } from "@app/types";
import type { SkillType } from "@app/types/assistant/skill_configuration";

export const SKILLS_SHEET_PAGE_IDS = {
  // Skill pages
  SELECTION: "add",
  INFO: "info",
  SPACE_SELECTION: "space_selection",
  // Tool pages
  TOOL_INFO: "tool-info",
  TOOL_CONFIGURATION: "tool-configuration",
  TOOL_EDIT: "tool-edit",
} as const;

export type CapabilityFilterType = "all" | "tools" | "skills";

export type SkillsSheetMode =
  | {
      type: typeof SKILLS_SHEET_PAGE_IDS.SELECTION;
    }
  | {
      type: typeof SKILLS_SHEET_PAGE_IDS.INFO;
      skill: SkillType;
      previousMode: SelectionMode;
    }
  | {
      type: typeof SKILLS_SHEET_PAGE_IDS.SPACE_SELECTION;
      skillConfiguration: SkillType;
      previousMode: SelectionMode;
    }
  | {
      type: typeof SKILLS_SHEET_PAGE_IDS.TOOL_INFO;
      action: BuilderAction;
      source: "toolDetails" | "addedTool";
    }
  | {
      type: typeof SKILLS_SHEET_PAGE_IDS.TOOL_CONFIGURATION;
      action: BuilderAction;
      mcpServerView: MCPServerViewTypeWithLabel;
    }
  | {
      type: typeof SKILLS_SHEET_PAGE_IDS.TOOL_EDIT;
      action: BuilderAction;
      index: number;
    };

export type SelectionMode = Extract<
  SkillsSheetMode,
  { type: typeof SKILLS_SHEET_PAGE_IDS.SELECTION }
>;

export type SpaceSelectionMode = Extract<
  SkillsSheetMode,
  { type: typeof SKILLS_SHEET_PAGE_IDS.SPACE_SELECTION }
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
