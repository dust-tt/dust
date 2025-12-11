import type { SkillConfigurationType } from "@app/types/assistant/skill_configuration";

export const SKILLS_SHEET_PAGE_IDS = {
  SELECTION: "add",
  INFO: "info",
} as const;

export type SkillsSheetMode =
  | { type: typeof SKILLS_SHEET_PAGE_IDS.SELECTION }
  | {
      type: typeof SKILLS_SHEET_PAGE_IDS.INFO;
      skillConfiguration: SkillConfigurationType;
      source: "toolDetails" | "addedTool";
    };

export type PageContentProps = {
  mode: SkillsSheetMode;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isSkillConfigurationsLoading: boolean;
  filteredSkills: SkillConfigurationType[];
  selectedSkillIds: Set<string>;
  handleSkillToggle: (skill: SkillConfigurationType) => void;
  onModeChange: (mode: SkillsSheetMode | null) => void;
  onClose: () => void;
  handleSave: () => void;
};
