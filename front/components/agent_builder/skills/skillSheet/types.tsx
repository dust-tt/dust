import type React from "react";

import type { AgentBuilderSkillsType } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { UserType, WorkspaceType } from "@app/types";
import type {
  SkillRelations,
  SkillType,
} from "@app/types/assistant/skill_configuration";

export const SKILLS_SHEET_PAGE_IDS = {
  SELECTION: "add",
  INFO: "info",
  SPACE_SELECTION: "space_selection",
} as const;

export type SkillsSheetMode =
  | {
      type: typeof SKILLS_SHEET_PAGE_IDS.SELECTION;
    }
  | {
      type: typeof SKILLS_SHEET_PAGE_IDS.INFO;
      skillConfiguration: SkillType & { relations: SkillRelations };
      previousMode: SelectionMode;
    }
  | {
      type: typeof SKILLS_SHEET_PAGE_IDS.SPACE_SELECTION;
      skillConfiguration: SkillType & { relations: SkillRelations };
      previousMode: SelectionMode;
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
